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
    // Log untuk debugging
    console.log('[TRAINER] Message received:', {
      hasMsg: !!msg,
      hasFrom: !!(msg && msg.from),
      chatType: msg?.chat?.type,
      text: msg?.text
    });
    
    // Validasi msg dan msg.from
    if (!msg || !msg.from) {
      console.error('[TRAINER] Invalid message object - no msg.from');
      return;
    }
    
    const userId = msg.from.id;
    console.log(`[TRAINER] User ID: ${userId}, Is Trainer: ${isTrainer(userId)}`);
    
    if (!isTrainer(userId)) {
      console.log(`[TRAINER] User ${userId} bukan trainer, akses ditolak`);
      // Jangan kirim pesan error biar tidak spam
      return;
    }
    
    try {
      await handler(msg, match);
    } catch (err) {
      console.error('[TRAINER ERROR]', err.message, err.stack);
      if (msg.chat && msg.chat.id) {
        bot.sendMessage(msg.chat.id, '⚠️ Terjadi error. Coba lagi nanti.');
      }
    }
  };
}

module.exports = { isTrainer, trainerOnly };