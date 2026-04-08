const supabase = require('../db');
const { getToday, escapeMarkdown, dbQuery } = require('../utils');
const { isRateLimited, isActiveMember } = require('../middleware');

/**
 * Format caption yang valid:
 * "Nama - Before - Nama Service"
 * "Nama - After - Nama Service"
 *
 * Minimal harus ada kata "before" atau "after" di caption
 */
function parseCaption(caption) {
  if (!caption) return null;

  const lower = caption.toLowerCase();
  const hasBefore = lower.includes('before');
  const hasAfter = lower.includes('after');

  if (!hasBefore && !hasAfter) return null;
  if (hasBefore && hasAfter) return null; // ambiguous

  return hasBefore ? 'before' : 'after';
}

/**
 * Handler foto masuk ke grup
 * Hanya proses kalau user hadir hari ini
 */
async function handleFoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const caption = msg.caption || '';
  const today = getToday();

  // Rate limit: max 10 foto per menit (per user)
  if (isRateLimited(userId, 'foto', 10)) {
    return bot.sendMessage(chatId, '⏳ Terlalu banyak foto. Coba lagi sebentar.');
  }

  // Validasi outlet terdaftar
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, is_active')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[FOTO] Error ambil outlet:', outletError.message);
    return;
  }

  if (!outlet || !outlet.is_active) return; // bukan grup outlet, abaikan

  // Validasi user terdaftar & aktif di outlet ini
  const isMember = await isActiveMember(userId, chatId);
  if (!isMember) {
    return bot.sendMessage(chatId,
      '❌ Kamu bukan anggota aktif outlet ini.\n' +
      'Daftar: /daftar Nama Lengkap | 08xxx'
    );
  }

  // Validasi caption
  const type = parseCaption(caption);
  if (!type) {
    return bot.sendMessage(chatId,
      '❌ Format caption tidak valid.\n\n' +
      'Gunakan: `Nama - Before - Nama Service`\n' +
      'atau: `Nama - After - Nama Service`\n\n' +
      'Pastikan ada kata *before* atau *after* di caption.',
      { parse_mode: 'Markdown' }
    );
  }

  // Validasi user sudah absen & statusnya hadir
  const { data: absen, error: absenError } = await supabase
    .from('absen')
    .select('status')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (absenError) {
    console.error('[FOTO] Error cek absen:', absenError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!absen) {
    return bot.sendMessage(chatId,
      '⚠️ Kamu belum absen hari ini.\n' +
      'Absen dulu dengan /absen'
    );
  }

  if (absen.status !== 'h') {
    return bot.sendMessage(chatId,
      `⚠️ Kamu tidak bisa kirim foto QC karena status hari ini bukan Hadir.`
    );
  }

  // Cek apakah sudah kirim foto tipe ini hari ini
  const { data: existing, error: existingError } = await supabase
    .from('qc_logs')
    .select('id')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .eq('type', type)
    .maybeSingle();

  if (existingError) {
    console.error('[FOTO] Error cek existing:', existingError.message);
  }

  if (existing) {
    return bot.sendMessage(chatId,
      `⚠️ Foto *${type}* sudah dikirim hari ini.\n` +
      `Tidak bisa kirim ulang. Hubungi manager jika ada masalah.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Ambil file_id foto resolusi tertinggi
  const photos = msg.photo;
  const fileId = photos[photos.length - 1].file_id;

  const { error: insertError } = await supabase
    .from('qc_logs')
    .insert({
      outlet_id: chatId,
      telegram_id: userId,
      date: today,
      type,
      file_id: fileId,
      caption: caption.slice(0, 500)
    });

  if (insertError) {
    console.error('[FOTO] Error insert:', insertError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal menyimpan foto. Coba lagi.');
  }

  // Cek apakah sudah lengkap (before + after)
  const { data: allQC, error: allQcError } = await supabase
    .from('qc_logs')
    .select('type')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today);

  if (allQcError) {
    console.error('[FOTO] Error cek kelengkapan:', allQcError.message);
  }

  const hasBefore = allQC?.some(q => q.type === 'before');
  const hasAfter = allQC?.some(q => q.type === 'after');

  const emoji = type === 'before' ? '📸' : '✨';
  let response = `${emoji} Foto *${type}* berhasil dicatat!`;

  if (hasBefore && hasAfter) {
    response += '\n\n🎉 QC hari ini *LENGKAP*! Before & After sudah masuk.';
  } else {
    const missing = type === 'before' ? 'after' : 'before';
    response += `\n\nJangan lupa kirim foto *${missing}* juga ya!`;
  }

  bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
}

function register(bot) {
  bot.on('photo', async (msg) => {
    try {
      await handleFoto(bot, msg);
    } catch (err) {
      console.error('[FOTO ERROR]', err.message);
      // PERBAIKAN: kirim pesan error ke grup agar user tahu ada masalah
      if (msg?.chat?.id) {
        bot.sendMessage(msg.chat.id, '⚠️ Gagal memproses foto. Coba lagi nanti.');
      }
    }
  });
}

module.exports = { register };