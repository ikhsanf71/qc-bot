const supabase = require('../db');
const { getToday, escapeMarkdown } = require('../utils');
const { isActiveMember, isRateLimited } = require('../middleware');

/**
 * /skip <alasan>
 * Staff yang hadir tapi tidak kirim foto wajib mengisi alasan
 */
async function handleSkip(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const reason = match[1]?.trim();
  const today = getToday();

  // Rate limit
  if (isRateLimited(userId, 'skip', 2)) {
    return bot.sendMessage(chatId, '⏳ Terlalu banyak request. Coba lagi sebentar.');
  }

  if (!reason) {
    return bot.sendMessage(chatId,
      '❌ Format: /skip <alasan>\n' +
      'Contoh: /skip Tidak ada customer hari ini\n' +
      'Contoh: /skip Outlet sepi\n\n' +
      'Alasan akan dicatat dan bisa dilihat manager.'
    );
  }

  // Validasi outlet terdaftar
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, is_active')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError || !outlet || !outlet.is_active) {
    return bot.sendMessage(chatId, '❌ Outlet ini tidak terdaftar atau tidak aktif.');
  }

  // Validasi user terdaftar & aktif
  const isMember = await isActiveMember(userId, chatId);
  if (!isMember) {
    return bot.sendMessage(chatId, '❌ Kamu bukan anggota aktif outlet ini.');
  }

  // Cek apakah user hari ini absen dengan status 'h' (hadir)
  const { data: absen, error: absenError } = await supabase
    .from('absen')
    .select('status')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (absenError) {
    console.error('[SKIP] Error cek absen:', absenError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!absen) {
    return bot.sendMessage(chatId, '⚠️ Kamu belum absen hari ini. Absen dulu dengan /absen');
  }

  if (absen.status !== 'h') {
    return bot.sendMessage(chatId, '⚠️ Hanya staff dengan status HADIR yang bisa mengisi alasan skip.');
  }

  // Cek apakah sudah kirim foto (before/after) hari ini
  const { data: qcLogs, error: qcError } = await supabase
    .from('qc_logs')
    .select('type')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today);

  if (qcError) {
    console.error('[SKIP] Error cek qc:', qcError.message);
  }

  const hasBefore = qcLogs?.some(l => l.type === 'before') || false;
  const hasAfter = qcLogs?.some(l => l.type === 'after') || false;

  if (hasBefore || hasAfter) {
    return bot.sendMessage(chatId,
      'ℹ️ Kamu sudah mengirim foto QC hari ini. Tidak perlu skip.\n' +
      'Jika ingin menambah keterangan, hubungi manager.'
    );
  }

  // Cek apakah sudah pernah skip hari ini
  const { data: existingSkip, error: skipError } = await supabase
    .from('qc_skips')
    .select('id')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (skipError) {
    console.error('[SKIP] Error cek skip:', skipError.message);
  }

  if (existingSkip) {
    return bot.sendMessage(chatId, 'ℹ️ Kamu sudah mengisi alasan skip hari ini. Terima kasih.');
  }

  // Simpan alasan skip
  const { error: insertError } = await supabase
    .from('qc_skips')
    .insert({
      outlet_id: chatId,
      telegram_id: userId,
      date: today,
      reason: reason.slice(0, 500)
    });

  if (insertError) {
    console.error('[SKIP] Error insert skip:', insertError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal menyimpan alasan. Coba lagi.');
  }

  // Notifikasi ke manager outlet (opsional)
  const { data: managers } = await supabase
    .from('outlet_members')
    .select('telegram_id')
    .eq('outlet_id', chatId)
    .eq('role', 'manager')
    .eq('is_active', true);

  const { data: user } = await supabase
    .from('users')
    .select('full_name')
    .eq('telegram_id', userId)
    .maybeSingle();

  const staffName = user?.full_name || `User ${userId}`;

  for (const mgr of managers || []) {
    try {
      await bot.sendMessage(mgr.telegram_id,
        `📝 *Skip QC*\n\n` +
        `👤 ${escapeMarkdown(staffName)}\n` +
        `📅 ${today}\n` +
        `📌 Alasan: ${escapeMarkdown(reason)}`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* skip jika manager tidak bisa di-DM */ }
  }

  bot.sendMessage(chatId,
    `✅ Alasan skip dicatat.\n` +
    `📌 "${escapeMarkdown(reason)}"\n\n` +
    `Terima kasih atas informasinya.`,
    { parse_mode: 'Markdown' }
  );
}

function register(bot) {
  bot.onText(/\/skip (.+)/, (msg, match) => handleSkip(bot, msg, match));
}

module.exports = { register };