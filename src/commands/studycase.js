/**
 * /studycase <text>
 * Kirim pembelajaran/study case ke channel
 */

const { commandPattern } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendStudyCaseToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleStudyCase(bot, msg, match) {
  const chatId = msg.chat.id;
  let text = match[1]?.trim();

  if (!text) {
    text = getEdukasiMessage('studycase');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /studycase <teks pembelajaran>\nContoh: /studycase Beberapa hasil masih kurang rata di bagian tepi');
  }

  const success = await sendStudyCaseToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Study case berhasil dikirim ke channel!`);
    console.log(`[STUDYCASE] Dikirim oleh trainer ${msg.from.id}: ${text.substring(0, 50)}...`);
  } else {
    await bot.sendMessage(chatId, '⚠️ Gagal mengirim ke channel. Cek CHANNEL_ID di .env');
  }
}

function register(bot) {
  bot.onText(commandPattern('studycase'), (msg, match) => {
    trainerOnly(handleStudyCase, bot)(msg, match);
  });
}

module.exports = { register };