require('dotenv').config();

// ==========================
// ✅ VALIDASI ENV
// ==========================
const REQUIRED_ENV = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY', 'OWNER_IDS'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');

// ==========================
// 🚀 INIT BOT
// Interval dinaikkan dari 300ms ke 1000ms untuk menghindari rate limit
// ==========================
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: {
    interval: 1000,      // ← 1 detik (sebelumnya 300ms)
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
const { registerCron } = require('./src/cron');

setup.register(bot);
daftar.register(bot);
absen.register(bot);
foto.register(bot);
dashboard.register(bot);
admin.register(bot);

// ==========================
// ⏰ CRON JOBS
// ==========================
registerCron(bot);

// ==========================
// ❓ HELP
// ==========================
bot.onText(/\/start|\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `🤖 *QC Bot — Panduan Singkat*\n\n` +
    `*Staff:*\n` +
    `• /daftar Nama Lengkap | 08xxx\n` +
    `• /absen — pilih status kehadiran\n` +
    `• Kirim foto dengan caption: Nama - Before/After - Service\n\n` +
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
    `• /reset — hapus data hari ini (dengan konfirmasi)\n`,
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