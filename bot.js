require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==========================
// 💾 FILE STORAGE
// ==========================
const DATA_FILE = './qc-data.json';
const USER_FILE = './user-map.json';

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return {};
  }
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let qcData = load(DATA_FILE);
let userMap = load(USER_FILE);

// ==========================
// 🧠 UTILS
// ==========================
function normalizeName(name) {
  return name.trim().toLowerCase();
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function formatStatus(s) {
  return {
    h: 'Hadir',
    i: 'Izin',
    s: 'Sakit',
    l: 'Libur'
  }[s] || s;
}

// ==========================
// 📌 DAFTAR USER
// ==========================
bot.onText(/\/daftar (.+)/, (msg, match) => {
  const userId = msg.from.id;
  const name = normalizeName(match[1]);

  userMap[userId] = name;
  save(USER_FILE, userMap);

  bot.sendMessage(msg.chat.id, `✅ Terdaftar sebagai ${capitalize(name)}`);
});

// ==========================
// 📋 ABSEN AUTO BUTTON
// ==========================
bot.onText(/\/absen$/, (msg) => {
  const userId = msg.from.id;

  if (!userMap[userId]) {
    bot.sendMessage(msg.chat.id,
      "❌ Kamu belum daftar!\n/daftar namamu"
    );
    return;
  }

  bot.sendMessage(msg.chat.id, "Pilih status:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Hadir ✅", callback_data: "h" },
          { text: "Izin 🟡", callback_data: "i" }
        ],
        [
          { text: "Sakit 🤒", callback_data: "s" },
          { text: "Libur 💤", callback_data: "l" }
        ]
      ]
    }
  });
});

// ==========================
// 🎯 HANDLE BUTTON
// ==========================
bot.on('callback_query', (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const status = query.data;
  const date = getToday();

  const name = userMap[userId];

  if (!qcData[chatId]) qcData[chatId] = {};
  if (!qcData[chatId][date]) {
    qcData[chatId][date] = { users: {} };
  }

  const data = qcData[chatId][date];

  if (!data.users[name]) {
    data.users[name] = {
      status,
      before: false,
      after: false,
      total: 0
    };
  } else {
    data.users[name].status = status;
  }

  save(DATA_FILE, qcData);

  bot.sendMessage(chatId,
    `📋 ${capitalize(name)} → ${formatStatus(status)}`
  );
});

// ==========================
// 📋 ABSEN MANUAL (FALLBACK)
// ==========================
bot.onText(/\/absen (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const date = getToday();

  const input = match[1].split(',').map(x => x.trim());

  if (!qcData[chatId]) qcData[chatId] = {};
  if (!qcData[chatId][date]) {
    qcData[chatId][date] = { users: {} };
  }

  const data = qcData[chatId][date];

  input.forEach(item => {
    let [name, status = 'h'] = item.includes(':')
      ? item.split(':')
      : item.split(' ');

    name = normalizeName(name);
    status = status.toLowerCase()[0];

    if (!data.users[name]) {
      data.users[name] = {
        status,
        before: false,
        after: false,
        total: 0
      };
    } else {
      data.users[name].status = status;
    }
  });

  save(DATA_FILE, qcData);

  const list = Object.entries(data.users)
    .map(([n, u]) => `${capitalize(n)} (${formatStatus(u.status)})`);

  bot.sendMessage(chatId, `📋 Absen:\n${list.join(', ')}`);
});

// ==========================
// 📸 QC
// ==========================
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const date = getToday();
  const caption = msg.caption;

  if (!caption) {
    bot.sendMessage(chatId, "❌ Pakai caption!");
    return;
  }

  const parts = caption.split('-').map(x => x.trim());

  const name = normalizeName(parts[0]);
  const type = parts[1]?.toLowerCase();

  const data = qcData[chatId]?.[date];

  if (!data || !data.users[name]) {
    bot.sendMessage(chatId, "⚠️ Belum absen");
    return;
  }

  const user = data.users[name];

  if (user.status !== 'h') {
    bot.sendMessage(chatId, "⚠️ Status bukan hadir");
    return;
  }

  if (type.includes('before') && user.before) return;
  if (type.includes('after') && user.after) return;

  if (type.includes('before')) user.before = true;
  if (type.includes('after')) user.after = true;

  user.total++;

  save(DATA_FILE, qcData);

  bot.sendMessage(chatId, `✅ ${capitalize(name)} (${type})`);
});

// ==========================
// 📊 DASHBOARD
// ==========================
bot.onText(/\/dashboard/, (msg) => {
  const chatId = msg.chat.id;
  const date = getToday();

  const data = qcData[chatId]?.[date];
  if (!data) return bot.sendMessage(chatId, "Belum ada data");

  let text = `📊 DASHBOARD (${date})\n\n`;

  Object.entries(data.users).forEach(([name, u]) => {
    text += `${capitalize(name)} (${formatStatus(u.status)})\n`;
    text += `Before: ${u.before ? '✅' : '❌'} | `;
    text += `After: ${u.after ? '✅' : '❌'} | `;
    text += `Total: ${u.total}\n\n`;
  });

  bot.sendMessage(chatId, text);
});

// ==========================
// 🚨 AUTO TAG
// ==========================
function check(chatId) {
  const date = getToday();
  const data = qcData[chatId]?.[date];
  if (!data) return;

  const belum = Object.entries(data.users)
    .filter(([_, u]) => u.status === 'h' && (!u.before || !u.after))
    .map(([n]) => capitalize(n));

  if (belum.length) {
    bot.sendMessage(chatId,
      `🚨 Belum lengkap:\n${belum.join(', ')}`
    );
  }
}

// ==========================
// ⏰ CRON
// ==========================
cron.schedule('0 10 * * *', () => {
  Object.keys(qcData).forEach(chatId => {
    bot.sendMessage(chatId,
      "📋 Absen sekarang!\n/absen"
    );
  });
});

cron.schedule('0 13 * * *', () => {
  Object.keys(qcData).forEach(check);
});

console.log('🔥 BOT GOD MODE AKTIF');