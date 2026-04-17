/**
 * Channel Sender - Kirim pesan ke Channel publik
 */

const { formatChannelHeader, escapeMarkdown } = require('../../utils');
const { getRandomMessage } = require('./messageBank');

const CHANNEL_ID = process.env.CHANNEL_ID;

/**
 * Kirim pesan ke channel
 * @param {TelegramBot} bot 
 * @param {string} message 
 * @param {Object} options 
 * @returns {Promise<boolean>}
 */
async function sendToChannel(bot, message, options = {}) {
  if (!CHANNEL_ID) {
    console.error('[CHANNEL] CHANNEL_ID tidak diset di .env');
    return false;
  }

  try {
    const sendOptions = {
      parse_mode: 'Markdown',
      ...options
    };
    await bot.sendMessage(CHANNEL_ID, message, sendOptions);
    console.log(`[CHANNEL] Pesan terkirim ke channel`);
    return true;
  } catch (err) {
    console.error('[CHANNEL] Error:', err.message);
    return false;
  }
}

/**
 * Kirim highlight ke channel
 * @param {Object} data - { name, outlet, treatment, startTime, endTime, note, photoFileId }
 */
async function sendHighlightToChannel(bot, data) {
  const { name, outlet, treatment, startTime, endTime, note, photoFileId } = data;
  
  const header = formatChannelHeader('highlight');
  const message = `${header}\n\n` +
    `👤 *${escapeMarkdown(name)}*\n` +
    `📍 *${escapeMarkdown(outlet)}*\n` +
    `💅 *${escapeMarkdown(treatment)}*\n` +
    `⏱ ${startTime} - ${endTime}\n\n` +
    `✨ ${note || 'Hasil rapi, clean, dan presisi ✨'}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💪 Terus tingkatkan kualitas!`;

  if (photoFileId) {
    try {
      await bot.sendPhoto(CHANNEL_ID, photoFileId, {
        caption: message,
        parse_mode: 'Markdown'
      });
      console.log(`[CHANNEL] Highlight dikirim untuk ${name}`);
      return true;
    } catch (err) {
      console.error('[CHANNEL] Error send photo:', err.message);
      // Fallback ke text saja
      return await sendToChannel(bot, message);
    }
  }
  
  return await sendToChannel(bot, message);
}

/**
 * Kirim edukasi ke channel
 */
async function sendEdukasiToChannel(bot, text) {
  const header = formatChannelHeader('edukasi');
  const message = `${header}\n\n${text}\n\n💡 *Detail kecil bikin hasil jauh lebih bagus!*`;
  return await sendToChannel(bot, message);
}

/**
 * Kirim study case ke channel
 */
async function sendStudyCaseToChannel(bot, text) {
  const header = formatChannelHeader('studycase');
  const message = `${header}\n\n${text}\n\n📌 *Ini sering terjadi, jadi worth diperhatikan!*`;
  return await sendToChannel(bot, message);
}

/**
 * Kirim notice ke channel
 */
async function sendNoticeToChannel(bot, text) {
  const header = formatChannelHeader('notice');
  const message = `${header}\n\n${text}\n\n🙏 *Biar kita bisa improve bareng!*`;
  return await sendToChannel(bot, message);
}

/**
 * Kirim progress ke channel
 */
async function sendProgressToChannel(bot, name, outlet, type, extraMessage = null) {
  const header = formatChannelHeader(type === 'up' ? 'progress' : 'stable');
  const message = `${header}\n\n` +
    `👤 *${escapeMarkdown(name)}*\n` +
    `📍 *${escapeMarkdown(outlet)}*\n\n` +
    `${extraMessage || (type === 'up' ? '🔥 Perkembangan bagus! 💪 Keep going!' : '👌 Konsisten itu juga progress 👍')}`;
  return await sendToChannel(bot, message);
}

/**
 * Kirim reward ke channel
 */
async function sendRewardToChannel(bot, name, outlet, rewardType, extraMessage = null) {
  const header = formatChannelHeader(`reward_${rewardType}`);
  let message = `${header}\n\n` +
    `👤 *${escapeMarkdown(name)}*\n` +
    `📍 *${escapeMarkdown(outlet)}*\n\n`;
  
  if (rewardType === 'consistent') {
    message += `${extraMessage || '🔥 Konsistensi yang luar biasa! Pertahankan! 👏'}`;
  } else if (rewardType === 'improvement') {
    message += `${extraMessage || '✨ Progress keliatan banget! Terus tingkatkan! 🚀'}`;
  } else if (rewardType === 'active') {
    message += `${extraMessage || '⚡ Paling aktif hari ini! Semangatnya menular! 🌟'}`;
  }
  
  return await sendToChannel(bot, message);
}

module.exports = {
  sendToChannel,
  sendHighlightToChannel,
  sendEdukasiToChannel,
  sendStudyCaseToChannel,
  sendNoticeToChannel,
  sendProgressToChannel,
  sendRewardToChannel
};