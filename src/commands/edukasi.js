/**
 * /edukasi <text>
 * Kirim tips edukasi ke channel
 */

const { commandPattern } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendEdukasiToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleEdukasi(bot, msg, match) {
  // Validasi awal
  if (!msg || !msg.chat) {
    console.error('[EDUKASI] Invalid message object');
    return;
  }

  const chatId = msg.chat.id;
  
  // Cek apakah match dan match[1] ada
  let text = null;
  if (match && match[1]) {
    text = match[1]?.trim();
  }

  // Jika tidak ada text, ambil dari bank kalimat
  if (!text) {
    text = getEdukasiMessage('tips');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /edukasi <teks edukasi>\nContoh: /edukasi Lighting yang baik membuat foto lebih jelas');
  }

  console.log(`[EDUKASI] Mengirim ke channel: ${text.substring(0, 50)}...`);
  
  const success = await sendEdukasiToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Tips edukasi berhasil dikirim ke channel!`);
  } else {
    await bot.sendMessage(chatId, '⚠️ Gagal mengirim ke channel. Cek CHANNEL_ID di .env');
  }
}

function register(bot) {
  bot.onText(commandPattern('edukasi'), (msg, match) => {
    trainerOnly(handleEdukasi, bot)(msg, match);
  });
}

module.exports = { register };