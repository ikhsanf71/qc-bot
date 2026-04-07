require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==========================
// 📸 VALIDASI FOTO
// ==========================
bot.on('photo', (msg) => {
  const caption = msg.caption || '';

  if (!caption.includes('-')) {
    bot.sendMessage(
      msg.chat.id,
      '❌ Format salah!\nGunakan: Nama - Before/After'
    );
    return;
  }

  bot.sendMessage(msg.chat.id, '✅ Format OK');
});

// ==========================
// 📋 ABSEN COMMAND
// ==========================
bot.onText(/\/absen (.+)/, (msg, match) => {
  const names = match[1];

  bot.sendMessage(
    msg.chat.id,
    `✅ Absen diterima:\n${names}`
  );
});

// ==========================
// ❌ ABSEN ERROR
// ==========================
bot.onText(/\/absen$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '❌ Format salah!\nContoh:\n/absen Sinta, Rina, Dwi'
  );
});

// ==========================
// 💬 DEFAULT MESSAGE
// ==========================
bot.on('message', (msg) => {
  if (!msg.text) return;

  if (!msg.text.startsWith('/absen')) {
    // optional: biarin aja atau kasih respon ringan
  }
});

console.log('🤖 Bot jalan bro...');