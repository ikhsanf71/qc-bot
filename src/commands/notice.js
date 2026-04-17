/**
 * /notice <text>
 * Kirim pengumuman/reminder ke channel
 */

const { commandPattern } = require('../../utils');
const { trainerOnly } = require('../middleware/trainerOnly');
const { sendNoticeToChannel } = require('../services/channelSender');
const { getEdukasiMessage } = require('../services/messageBank');

async function handleNotice(bot, msg, match) {
  const chatId = msg.chat.id;
  let text = match[1]?.trim();

  if (!text) {
    text = getEdukasiMessage('notice');
  }

  if (!text) {
    return bot.sendMessage(chatId, '❌ Format: /notice <teks pengumuman>\nContoh: /notice Biar kerjaan lebih rapi, pastikan foto before tidak terlewat');
  }

  const success = await sendNoticeToChannel(bot, text);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Notice berhasil dikirim ke channel!`);
    console.log(`[NOTICE] Dikirim oleh trainer ${msg.from.id}: ${text.substring(0, 50)}...`);
  } else {
    await bot.sendMessage(chatId, '⚠️ Gagal mengirim ke channel. Cek CHANNEL_ID di .env');
  }
}

function register(bot) {
  bot.onText(commandPattern('notice'), (msg, match) => {
    trainerOnly(handleNotice, bot)(msg, match);
  });
}

module.exports = { register };