/**
 * Middleware untuk mengecek apakah user adalah TRAINER
 * Trainer ID disimpan di .env: TRAINER_IDS (pisah koma)
 */

const TRAINER_IDS = process.env.TRAINER_IDS
  ? process.env.TRAINER_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

function isTrainer(telegramId) {
  return TRAINER_IDS.includes(telegramId);
}

/**
 * Wrapper untuk command yang hanya bisa diakses trainer
 * @param {Function} handler 
 * @param {TelegramBot} bot 
 * @returns {Function}
 */
function trainerOnly(handler, bot) {
  return async (msg, match) => {
    const userId = msg.from.id;
    if (!isTrainer(userId)) {
      return bot.sendMessage(msg.chat.id, '⛔ Command ini hanya untuk Trainer.');
    }
    try {
      await handler(msg, match);
    } catch (err) {
      console.error('[TRAINER ERROR]', err.message);
      bot.sendMessage(msg.chat.id, '⚠️ Terjadi error. Coba lagi nanti.');
    }
  };
}

module.exports = { isTrainer, trainerOnly };