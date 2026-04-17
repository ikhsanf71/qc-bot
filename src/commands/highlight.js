/**
 * /highlight [optional note]
 * Trainer reply ke foto QC untuk dipublish ke channel
 */

const supabase = require('../../db');
const { commandPattern, escapeMarkdown } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendHighlightToChannel } = require('../services/channelSender');
const { getDefaultHighlightNote } = require('../services/messageBank');

async function handleHighlight(bot, msg, match) {
  // Validasi awal dengan logging
  console.log('[HIGHLIGHT] Raw message:', {
    hasMsg: !!msg,
    msgType: msg?.chat?.type,
    msgText: msg?.text,
    hasReplyTo: !!msg?.reply_to_message
  });
  
  if (!msg || !msg.from || !msg.chat) {
    console.error('[HIGHLIGHT] Invalid message object - missing msg/from/chat');
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const note = match && match[1] ? match[1].trim() : null;

  // Cek apakah command ini adalah reply ke pesan
  if (!msg.reply_to_message) {
    console.log('[HIGHLIGHT] No reply_to_message');
    return bot.sendMessage(chatId, '❌ Harus reply ke foto QC yang ingin di-highlight!');
  }
  
  // ... lanjutkan kode yang sudah ada
}
  const repliedMsg = msg.reply_to_message;
  
  // Cek apakah yang di-reply adalah foto
  if (!repliedMsg.photo) {
    return bot.sendMessage(chatId, '❌ Harus reply ke FOTO QC!');
  }

  // Cek apakah foto memiliki caption
  const caption = repliedMsg.caption || '';
  if (!caption) {
    return bot.sendMessage(chatId, '❌ Foto tidak memiliki caption. Pastikan foto QC dikirim dengan format yang benar.');
  }

  // Parse caption untuk mendapatkan data
  const parts = caption.split(' - ').map(p => p.trim());
  if (parts.length < 3) {
    return bot.sendMessage(chatId, '❌ Format caption tidak lengkap. Harus: Nama - Before/After - Treatment - HH:MM-HH:MM - Outlet');
  }

  const name = parts[0];
  const type = parts[1]?.toLowerCase();
  const treatment = parts[2];
  
  // Cari time range dan outlet
  let startTime = null, endTime = null, outletName = null;
  if (parts.length >= 4) {
    const timeParts = parts[3].split('-');
    if (timeParts.length === 2) {
      startTime = timeParts[0];
      endTime = timeParts[1];
    }
  }
  if (parts.length >= 5) {
    outletName = parts[4];
  }

  // Validasi: sebaiknya hanya highlight foto AFTER
  if (type !== 'after') {
    return bot.sendMessage(chatId, '⚠️ Sebaiknya highlight foto AFTER (hasil akhir) untuk menunjukkan best result.');
  }

  // Cari qc_log_id dari database
  const { data: qcLog, error: qcError } = await supabase
    .from('qc_logs')
    .select('id, file_id')
    .eq('file_id', repliedMsg.photo[repliedMsg.photo.length - 1].file_id)
    .maybeSingle();

  if (qcError || !qcLog) {
    console.error('[HIGHLIGHT] Error find qc_log:', qcError?.message);
    // Tetap lanjut tanpa qc_log_id
  }

  // Simpan ke database
  const { error: insertError } = await supabase
    .from('highlights')
    .insert({
      qc_log_id: qcLog?.id || null,
      trainer_id: userId,
      note: note || getDefaultHighlightNote()
    });

  if (insertError) {
    console.error('[HIGHLIGHT] Error save:', insertError.message);
    // Tidak perlu return error, tetap lanjut kirim ke channel
  }

  // Update qc_logs is_highlighted
  if (qcLog?.id) {
    await supabase
      .from('qc_logs')
      .update({ is_highlighted: true })
      .eq('id', qcLog.id);
  }

  // Kirim ke channel
  const photoFileId = repliedMsg.photo[repliedMsg.photo.length - 1].file_id;
  const success = await sendHighlightToChannel(bot, {
    name: name,
    outlet: outletName || 'Outlet tidak diketahui',
    treatment: treatment,
    startTime: startTime || '-',
    endTime: endTime || '-',
    note: note || getDefaultHighlightNote(),
    photoFileId: photoFileId
  });

  if (success) {
    await bot.sendMessage(chatId, `✅ Highlight berhasil dikirim ke channel!\n📝 Note: ${note || getDefaultHighlightNote()}`);
  } else {
    await bot.sendMessage(chatId, '⚠️ Gagal mengirim ke channel. Cek CHANNEL_ID di .env');
  }
}

function register(bot) {
  bot.onText(commandPattern('highlight'), (msg, match) => {
    trainerOnly(handleHighlight, bot)(msg, match);
  });
}

module.exports = { register };