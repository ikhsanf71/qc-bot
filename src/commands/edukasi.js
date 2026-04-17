/**
 * /edukasi <text>
 * Kirim tips edukasi ke channel
 */

const { commandPattern } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendEdukasiToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleEdukasi(bot, msg, match) {
  const chatId = msg.chat.id;
  let text = match[1]?.trim();

  // Jika tidak ada text, ambil dari bank kalimat
  if (!text) {
    text = getEdukasiMessage('tips');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /edukasi <teks edukasi>\nContoh: /edukasi Lighting yang baik membuat foto lebih jelas');
  }

  const success = await sendEdukasiToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Tips edukasi berhasil dikirim ke channel!`);
    console.log(`[EDUKASI] Dikirim oleh trainer ${msg.from.id}: ${text.substring(0, 50)}...`);
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