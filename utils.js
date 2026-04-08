// ==========================
// 🕐 TIMEZONE
// ==========================

/**
 * Ambil tanggal hari ini dalam WIB (bukan UTC!)
 * Format: YYYY-MM-DD
 */
function getToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta'
  }).format(new Date());
}

/**
 * Format waktu sekarang dalam WIB
 * Format: HH:MM
 */
function getNowWIB() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

// ==========================
// 🔠 FORMAT
// ==========================

const STATUS_LABEL = {
  h: '✅ Hadir',
  i: '🟡 Izin',
  s: '🤒 Sakit',
  l: '💤 Libur'
};

function formatStatus(s) {
  return STATUS_LABEL[s] || s;
}

/**
 * Escape karakter Markdown
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Mention user dengan nama (klik → buka profil Telegram)
 * PERBAIKAN: nama di-escape dulu
 */
function mentionUser(telegramId, name) {
  return `[${escapeMarkdown(name)}](tg://user?id=${telegramId})`;
}

// ==========================
// ✅ VALIDASI
// ==========================

/**
 * Validasi format nomor HP Indonesia
 * Contoh valid: 08123456789, 628123456789, +628123456789
 */
function isValidPhone(phone) {
  return /^(\+62|62|0)8[1-9][0-9]{7,10}$/.test(phone.replace(/\s|-/g, ''));
}

/**
 * Normalize nomor HP ke format 08xxx
 */
function normalizePhone(phone) {
  const cleaned = phone.replace(/\s|-/g, '');
  if (cleaned.startsWith('+62')) return '0' + cleaned.slice(3);
  if (cleaned.startsWith('62')) return '0' + cleaned.slice(2);
  return cleaned;
}

// ==========================
// 🛡️ SAFE DB QUERY
// ==========================

/**
 * Wrapper query Supabase dengan error handling konsisten
 * Throw error kalau query gagal agar bisa di-catch di caller
 */
async function dbQuery(queryFn) {
  const { data, error } = await queryFn();
  if (error) throw error;
  return data;
}

module.exports = {
  getToday,
  getNowWIB,
  formatStatus,
  mentionUser,
  escapeMarkdown,
  isValidPhone,
  normalizePhone,
  dbQuery
};