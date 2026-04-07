require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==========================
// 💾 FILE STORAGE
// ==========================
const DATA_FILE = './qc-data.json';

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let qcData = loadData();

// ==========================
// 🧠 UTILS
// ==========================
function normalizeName(name) {
  return name.trim().toLowerCase();
}

// ==========================
// 🧠 PARSE CAPTION
// ==========================
function parseCaption(caption) {
  if (!caption) return { error: "❌ Wajib pakai caption!\nFormat:\nNama - Before/After - Service" };

  const parts = caption.split('-').map(p => p.trim());

  if (parts.length < 3) {
    return { error: "❌ Format kurang lengkap!\nGunakan:\nNama - Before/After - Service" };
  }

  const name = normalizeName(parts[0]);
  const type = parts[1].toLowerCase();
  const service = parts.slice(2).join(' - ');

  if (!name) return { error: "❌ Nama tidak boleh kosong!" };

  if (!type.includes('before') && !type.includes('after')) {
    return { error: "❌ Harus ada 'Before' atau 'After'" };
  }

  if (!service) return { error: "❌ Service tidak boleh kosong!" };

  return { name, type, service };
}

// ==========================
// 📋 ABSEN
// ==========================
bot.onText(/\/absen (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const names = match[1].split(',').map(n => normalizeName(n));

  qcData[chatId] = {
    absen: names,
    users: {}
  };

  names.forEach(name => {
    qcData[chatId].users[name] = {
      before: false,
      after: false,
      total: 0
    };
  });

  saveData(qcData);

  bot.sendMessage(chatId, `📋 Absen:\n${names.join(', ')}`);
});

// ==========================
// 📸 HANDLE FOTO QC
// ==========================
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const caption = msg.caption;

  const result = parseCaption(caption);

  if (result.error) {
    bot.sendMessage(chatId, result.error);
    return;
  }

  const data = qcData[chatId];

  if (!data || !data.users[result.name]) {
    bot.sendMessage(chatId, `⚠️ ${result.name} belum absen`);
    return;
  }

  const user = data.users[result.name];

  // prevent double before
  if (result.type.includes('before') && user.before) {
    bot.sendMessage(chatId, `⚠️ ${result.name} sudah kirim BEFORE`);
    return;
  }

  // prevent double after
  if (result.type.includes('after') && user.after) {
    bot.sendMessage(chatId, `⚠️ ${result.name} sudah kirim AFTER`);
    return;
  }

  if (result.type.includes('before')) user.before = true;
  if (result.type.includes('after')) user.after = true;

  user.total += 1;

  saveData(qcData);

  bot.sendMessage(chatId, `✅ ${result.name} (${result.type})`);
});

// ==========================
// 🔍 DASHBOARD
// ==========================
bot.onText(/\/dashboard/, (msg) => {
  const chatId = msg.chat.id;
  const data = qcData[chatId];

  if (!data) {
    bot.sendMessage(chatId, "⚠️ Belum ada data");
    return;
  }

  const sorted = Object.entries(data.users)
    .sort((a, b) => b[1].total - a[1].total);

  let text = "📊 DASHBOARD QC\n\n";

  sorted.forEach(([name, info]) => {
    text += `${name}\n`;
    text += `Before: ${info.before ? '✅' : '❌'} | `;
    text += `After: ${info.after ? '✅' : '❌'} | `;
    text += `Total: ${info.total}\n\n`;
  });

  bot.sendMessage(chatId, text);
});

// ==========================
// 🚨 AUTO TAG BELUM LENGKAP
// ==========================
function checkBelumLengkap(chatId) {
  const data = qcData[chatId];
  if (!data) return;

  const belum = Object.entries(data.users)
    .filter(([_, u]) => !u.before || !u.after)
    .map(([name]) => name);

  if (belum.length > 0) {
    bot.sendMessage(chatId, `🚨 Belum lengkap:\n${belum.join(', ')}`);
  }
}

// ==========================
// ⏰ REMINDER
// ==========================
cron.schedule('0 10 * * *', () => {
  Object.keys(qcData).forEach(chatId => {
    bot.sendMessage(chatId,
      `📋 ROLLCALL TIME!\n/absen Nama1, Nama2`
    );
  });
});

// ==========================
// ⏰ AUTO TAG
// ==========================
cron.schedule('0 13 * * *', () => {
  Object.keys(qcData).forEach(chatId => {
    checkBelumLengkap(chatId);
  });
});

console.log('🔥 QC BOT HARDENED READY');