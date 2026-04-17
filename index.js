require('dotenv').config();

// ==========================
// ✅ VALIDASI ENV
// ==========================
const REQUIRED_ENV = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY', 'OWNER_IDS', 'HQ_GROUP_ID'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');

// ==========================
// 🚀 INIT BOT
// Interval 1000ms untuk menghindari rate limit
// ==========================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    interval: 1000,
    autoStart: true,
    params: { timeout: 10 }
  }
});

console.log('🚀 QC Bot starting...');

// ==========================
// 📦 REGISTER COMMANDS
// ==========================
const setup     = require('./src/commands/setup');
const daftar    = require('./src/commands/daftar');
const absen     = require('./src/commands/absen');
const foto      = require('./src/commands/foto');
const dashboard = require('./src/commands/dashboard');
const admin     = require('./src/commands/admin');
const skip      = require('./src/commands/skip');

setup.register(bot);
daftar.register(bot);
absen.register(bot);
foto.register(bot);
dashboard.register(bot);
admin.register(bot);
skip.register(bot);

// ==========================
// ⏰ CRON JOBS (NEW SYSTEM)
// ==========================
const { registerAllCrons } = require('./src/crons');
registerAllCrons(bot);

// ==========================
// ❓ HELP (UPDATED DENGAN FORMAT BARU)
// ==========================
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `🤖 *QC Bot — Sistem Kontrol Operasional*\n\n` +
    `*📸 FORMAT FOTO WAJIB:*\n` +
    `Nama - Before/After - Treatment - HH:MM-HH:MM - Outlet\n` +
    `Contoh: Andi - After - Gel Polish - 14:00-15:30 - Outlet A\n\n` +
    `*Staff:*\n` +
    `• /daftar Nama Lengkap | 08xxx\n` +
    `• /absen — pilih status kehadiran\n` +
    `• Kirim foto dengan FORMAT DI ATAS\n` +
    `• /skip <alasan> — jika tidak kirim foto\n\n` +
    `*Manager:*\n` +
    `• /dashboard — recap outlet hari ini\n` +
    `• /libur — set outlet libur\n` +
    `• /operational — set outlet kembali aktif\n` +
    `• /approve <id> — approve transfer staff\n` +
    `• /rejecttransfer <id> — tolak transfer staff\n\n` +
    `*Owner:*\n` +
    `• /setup NamaOutlet — daftarkan grup sebagai outlet\n` +
    `• /addmanager @username — assign manager\n` +
    `• /rekap — recap semua outlet\n` +
    `• /outlets — daftar semua outlet\n` +
    `• /reset — hapus data hari ini (dengan konfirmasi)\n\n` +
    `📊 *Laporan harian dikirim ke HQ setiap jam 22:05 WIB*`,
    { parse_mode: 'Markdown' }
  );
});

// ==========================
// 🛡️ GLOBAL ERROR HANDLER
// ==========================
bot.on('polling_error', (err) => {
  console.error('[POLLING ERROR]', err.code, err.message);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

console.log('🔥 QC Bot READY!');
console.log('📋 Sistem berjalan dengan fitur:');
console.log('   - Validasi caption ketat (format 5 bagian)');
console.log('   - Evaluasi performa individu (PERFORM/NORMAL/WARNING)');
console.log('   - Skor outlet (EXCELLENT/OK/PROBLEM)');
console.log('   - Laporan harian otomatis jam 22:05 WIB');
console.log('   - Filter HQ (hanya foto AFTER prioritas)');
console.log('   - Reminder 11:00, 14:00, 17:00, 21:30 WIB');