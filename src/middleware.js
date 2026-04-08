const supabase = require('./db');

// ==========================
// 👑 ROLE CONSTANTS
// ==========================
const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  STAFF: 'staff'
};

const OWNER_IDS = process.env.OWNER_IDS
  ? process.env.OWNER_IDS.split(',').map(id => parseInt(id.trim()))
  : [];


// ==========================
// 🔐 ROLE CHECKER
// ==========================

function isOwner(telegramId) {
  return OWNER_IDS.includes(telegramId);
}

/**
 * Cek apakah user punya role tertentu di outlet ini
 * @param {number} telegramId
 * @param {number} outletId
 * @param {string[]} roles - array of role yang diizinkan
 */
async function hasRole(telegramId, outletId, roles = []) {
  if (isOwner(telegramId)) return true; // owner bypass semua

  const { data, error } = await supabase
    .from('outlet_members')
    .select('role')
    .eq('telegram_id', telegramId)
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .single();

  if (error || !data) return false;
  return roles.includes(data.role);
}

async function isManagerOrOwner(telegramId, outletId) {
  return hasRole(telegramId, outletId, [ROLES.MANAGER, ROLES.OWNER]);
}

async function isActiveMember(telegramId, outletId) {
  return hasRole(telegramId, outletId, [ROLES.STAFF, ROLES.MANAGER, ROLES.OWNER]);
}


// ==========================
// ⏱️ RATE LIMITER
// Simple in-memory rate limiter per user per command
// Reset otomatis setiap 60 detik
// ==========================
const rateLimitMap = new Map();

/**
 * Cek apakah user melebihi rate limit
 * @param {number} userId
 * @param {string} command
 * @param {number} limitPerMinute - default 5x per menit
 */
function isRateLimited(userId, command, limitPerMinute = 5) {
  const key = `${userId}:${command}`;
  const now = Date.now();
  const windowMs = 60 * 1000;

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  // Hapus request yang sudah di luar window
  const timestamps = rateLimitMap.get(key).filter(t => now - t < windowMs);
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);

  return timestamps.length > limitPerMinute;
}

// Bersihkan map setiap 5 menit agar tidak memory leak
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const fresh = timestamps.filter(t => now - t < windowMs);
    if (fresh.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, fresh);
    }
  }
}, 5 * 60 * 1000);


// ==========================
// 🛡️ ERROR HANDLER
// Wrapper biar setiap command handler tidak perlu try/catch sendiri
// ==========================

/**
 * Wrap handler function dengan try/catch otomatis
 * @param {Function} fn - async handler (msg, match) => {}
 * @param {TelegramBot} bot
 */
function withErrorHandler(fn, bot) {
  return async (msg, match) => {
    try {
      await fn(msg, match);
    } catch (err) {
      console.error(`[ERROR] ${err.message}`, err);
      const chatId = msg?.chat?.id;
      if (chatId) {
        bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi atau hubungi admin.');
      }
    }
  };
}

/**
 * Wrap callback_query handler dengan try/catch otomatis
 */
function withCallbackErrorHandler(fn, bot) {
  return async (q) => {
    try {
      await fn(q);
    } catch (err) {
      console.error(`[CALLBACK ERROR] ${err.message}`, err);
      bot.answerCallbackQuery(q.id, { text: '⚠️ Error, coba lagi.' });
    }
  };
}


// ==========================
// 📝 AUDIT LOGGER
// ==========================

async function auditLog({ actor, action, outletId, target, metadata }) {
  try {
    await supabase.from('audit_logs').insert({
      actor_telegram_id: actor,
      action,
      outlet_id: outletId || null,
      target_telegram_id: target || null,
      metadata: metadata || null
    });
  } catch (err) {
    // Audit log gagal tidak boleh crash flow utama
    console.error('[AUDIT LOG ERROR]', err.message);
  }
}


module.exports = {
  ROLES,
  OWNER_IDS,
  isOwner,
  hasRole,
  isManagerOrOwner,
  isActiveMember,
  isRateLimited,
  withErrorHandler,
  withCallbackErrorHandler,
  auditLog
};