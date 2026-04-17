/**
 * /studycase <text>
 * Kirim pembelajaran/study case ke channel
 */

const { commandPattern } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendStudyCaseToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleStudyCase(bot, msg, match) {
  if (!msg || !msg.chat) {
    console.error('[STUDYCASE] Invalid message object');
    return;
  }

  const chatId = msg.chat.id;
  
  let text = null;
  if (match && match[1]) {
    text = match[1]?.trim();
  }

  if (!text) {
    text = getEdukasiMessage('studycase');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /studycase <teks pembelajaran>');
  }

  console.log(`[STUDYCASE] Mengirim ke channel: ${text.substring(0, 50)}...`);
  
  const success = await sendStudyCaseToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Study case berhasil dikirim ke channel!`);
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