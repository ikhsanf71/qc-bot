const supabase = require('../../db');
const { getToday, escapeMarkdown } = require('../../utils');
const { isRateLimited, isActiveMember } = require('../middleware');
const { parseCaption } = require('../services/captionParser');
const { validateQCUpload, getUserQCStatus } = require('../services/qcValidator');
const { shouldForwardToHQ } = require('../services/hqFilter');

/**
 * Handler foto masuk ke grup
 * Proses upload foto QC dengan validasi ketat:
 * - Format caption wajib: Nama - Before/After - Treatment - HH:MM-HH:MM - Outlet
 * - User harus sudah absen dengan status HADIR
 * - Maksimal 1 before dan 1 after per hari
 * - Foto AFTER prioritas akan dikirim ke HQ jika belum lengkap
 */
async function handleFoto(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const caption = msg.caption || '';
  const today = getToday();

  // Rate limit: max 10 foto per menit per user
  if (isRateLimited(userId, 'foto', 10)) {
    return bot.sendMessage(chatId, '⏳ Terlalu banyak foto. Coba lagi sebentar.');
  }

  // 1. Validasi outlet terdaftar dan aktif
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name, is_active')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[FOTO] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error. Coba lagi nanti.');
  }

  if (!outlet || !outlet.is_active) {
    // Bukan grup outlet yang terdaftar, abaikan diam-diam
    return;
  }

  // 2. Validasi user adalah anggota aktif outlet
  const isMember = await isActiveMember(userId, chatId);
  if (!isMember) {
    return bot.sendMessage(chatId,
      '❌ Kamu bukan anggota aktif outlet ini.\n' +
      'Daftar: /daftar Nama Lengkap | 08xxx'
    );
  }

  // 3. Validasi format caption (menggunakan service)
  const parsed = parseCaption(caption);
  if (!parsed) {
    return bot.sendMessage(chatId,
      `❌ *Format caption salah!*\n\n` +
      `Gunakan format wajib:\n` +
      `Nama - Before/After - Treatment - HH:MM-HH:MM - Outlet\n\n` +
      `Contoh:\n` +
      `Andi - After - Gel Polish - 14:00-15:30 - Outlet A\n\n` +
      `📌 Pastikan:\n` +
      `• Ada kata "Before" atau "After"\n` +
      `• Format jam HH:MM-HH:MM (contoh: 09:00-10:30)\n` +
      `• Semua bagian diisi (nama, treatment, outlet)`,
      { parse_mode: 'Markdown' }
    );
  }

  // 4. Validasi QC (absen, status hadir, tidak duplikat)
  const validation = await validateQCUpload(chatId, userId, parsed.type);
  if (!validation.valid) {
    return bot.sendMessage(chatId, validation.message, { parse_mode: 'Markdown' });
  }

  // 5. Ambil file_id foto resolusi tertinggi
  const photos = msg.photo;
  const fileId = photos[photos.length - 1].file_id;

  // 6. Simpan foto ke database dengan data terstruktur
  const { error: insertError } = await supabase
    .from('qc_logs')
    .insert({
      outlet_id: chatId,
      telegram_id: userId,
      date: today,
      type: parsed.type,
      file_id: fileId,
      caption: caption.slice(0, 500),
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      treatment: parsed.treatment,
      outlet_name: parsed.outletName,
      parsed: true
    });

  if (insertError) {
    console.error('[FOTO] Error insert:', insertError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal menyimpan foto. Coba lagi.');
  }

  // 7. Cek kelengkapan QC user setelah upload
  const qcStatus = await getUserQCStatus(chatId, userId, today);

  // 8. Buat pesan response
  let response = `✅ Foto *${parsed.type}* berhasil dicatat!\n`;
  response += `📌 Treatment: ${escapeMarkdown(parsed.treatment)}\n`;
  response += `⏰ Waktu: ${parsed.startTime} - ${parsed.endTime}\n`;
  response += `📍 Outlet: ${escapeMarkdown(parsed.outletName)}\n`;

  if (qcStatus.isComplete) {
    response += `\n🎉 *QC LENGKAP!* Before & After sudah masuk.\nTerima kasih atas disiplinnya! 👍`;
  } else if (parsed.type === 'before') {
    response += `\n📸 Jangan lupa kirim foto *AFTER* dengan format yang sama.`;
  } else if (parsed.type === 'after' && !qcStatus.hasBefore) {
    response += `\n⚠️ *Perhatian!* Anda belum mengirim foto BEFORE.\nMohon lengkapi QC untuk penilaian performa.`;
  }

  await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

  // 9. Filter dan kirim ke HQ (hanya foto AFTER prioritas)
  const shouldForward = await shouldForwardToHQ(chatId, userId, parsed.type);
  if (shouldForward && process.env.HQ_GROUP_ID) {
    try {
      const hqCaption = `⚠️ *PRIORITAS - QC Tidak Lengkap*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📸 *Foto QC dari outlet ${escapeMarkdown(outlet.name)}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Staff:* ${escapeMarkdown(parsed.name)}\n` +
        `🛠️ *Treatment:* ${escapeMarkdown(parsed.treatment)}\n` +
        `⏰ *Waktu:* ${parsed.startTime} - ${parsed.endTime}\n` +
        `📌 *Status:* HANYA AFTER (tanpa dokumentasi BEFORE)\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ Staff ini mengirim hasil akhir tanpa foto proses awal.\n` +
        `Perlu diingatkan untuk melengkapi dokumentasi.`;

      await bot.sendPhoto(process.env.HQ_GROUP_ID, fileId, {
        caption: hqCaption,
        parse_mode: 'Markdown'
      });
      console.log(`[HQ FORWARD] Foto dari user ${userId} di outlet ${outlet.name} dikirim ke HQ`);
    } catch (err) {
      console.error('[HQ FORWARD] Error:', err.message);
    }
  }
}

/**
 * Register event listener untuk foto
 */
function register(bot) {
  bot.on('photo', async (msg) => {
    try {
      await handleFoto(bot, msg);
    } catch (err) {
      console.error('[FOTO ERROR]', err.message, err.stack);
      // Kirim pesan error ke grup agar user tahu ada masalah
      if (msg?.chat?.id) {
        bot.sendMessage(msg.chat.id, '⚠️ Gagal memproses foto. Coba lagi nanti atau hubungi manager.');
      }
    }
  });
}

module.exports = { register };