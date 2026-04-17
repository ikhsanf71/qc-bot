/**
 * /notice <text>
 * Kirim pengumuman/reminder ke channel
 */

const { commandPattern } = require('../../utils');
const { isTrainer } = require('../middleware/trainerOnly');
const { sendNoticeToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleNotice(bot, msg, match) {
  if (!msg || !msg.from || !msg.chat) {
    console.error('[NOTICE] Invalid message object');
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isTrainer(userId)) {
    console.log(`[NOTICE] User ${userId} bukan trainer, akses ditolak`);
    return;
  }

  let text = null;
  if (match && match[1]) {
    text = match[1].trim();
  }

  if (!text) {
    text = getEdukasiMessage('notice');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /notice <teks pengumuman>');
  }

  console.log(`[NOTICE] Trainer ${userId} mengirim: ${text.substring(0, 50)}...`);
  
  const success = await sendNoticeToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Notice berhasil dikirim ke channel!`);
  } else {
    await bot.sendMessage(chatId, '⚠️ Gagal mengirim ke channel. Cek CHANNEL_ID di .env');
  }
}

function register(bot) {
  bot.onText(commandPattern('notice'), (msg, match) => {
    handleNotice(bot, msg, match);
  });
}

module.exports = { register };