require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

console.log("🚀 BOT STARTING...");

// ==========================
// 🔌 INIT BOT (WAJIB DI ATAS)
// ==========================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

console.log("ENV CHECK:", {
  BOT_TOKEN: process.env.BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  GROUP_ID: process.env.GROUP_ID
});

// ==========================
// 🔥 ERROR HANDLER (WAJIB)
// ==========================
bot.on("polling_error", console.log);
process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

// ==========================
// 🔌 SUPABASE
// ==========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ==========================
// 👑 ADMIN
// ==========================
const ADMINS = [5109637592];

function isAdmin(id) {
  return ADMINS.includes(id);
}

// ==========================
// 🧠 UTILS
// ==========================
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
bot.onText(/\/daftar (.+)/, async (msg, match) => {
  try {
    const userId = msg.from.id;
    const name = match[1].toLowerCase();

    await supabase.from('users').upsert({
      id: userId,
      name
    });

    bot.sendMessage(msg.chat.id, `✅ Terdaftar sebagai ${name}`);
  } catch (err) {
    console.log(err);
    bot.sendMessage(msg.chat.id, "❌ Error daftar");
  }
});

// ==========================
// 📋 ABSEN BUTTON
// ==========================
bot.onText(/\/absen$/, async (msg) => {
  try {
    const userId = msg.from.id;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user) {
      bot.sendMessage(msg.chat.id, "❌ Daftar dulu!\n/daftar namamu");
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
  } catch (err) {
    console.log(err);
  }
});

// ==========================
// 🎯 HANDLE BUTTON
// ==========================
bot.on('callback_query', async (q) => {
  try {
    const userId = q.from.id;
    const chatId = q.message.chat.id;
    const status = q.data;
    const date = getToday();

    await supabase.from('absen').upsert({
      chat_id: chatId,
      user_id: userId,
      date,
      status
    });

    bot.sendMessage(chatId, `📋 Status: ${formatStatus(status)}`);
  } catch (err) {
    console.log(err);
  }
});

// ==========================
// 📋 ABSEN MANUAL
// ==========================
bot.onText(/\/absen (.+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const date = getToday();
    const list = match[1].split(',');

    for (let item of list) {
      let [name, status = 'h'] = item.includes(':')
        ? item.split(':')
        : item.split(' ');

      name = name.toLowerCase();
      status = status.toLowerCase()[0];

      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('name', name)
        .single();

      if (!user) continue;

      await supabase.from('absen').upsert({
        chat_id: chatId,
        user_id: user.id,
        date,
        status
      });
    }

    bot.sendMessage(chatId, "✅ Absen manual masuk");
  } catch (err) {
    console.log(err);
  }
});

// ==========================
// 📸 QC
// ==========================
bot.on('photo', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const caption = msg.caption || '';
    const date = getToday();

    if (!caption.includes('-')) {
      bot.sendMessage(chatId, "❌ Format: Nama - Before/After - Service");
      return;
    }

    const type = caption.toLowerCase().includes('before')
      ? 'before'
      : 'after';

    const { data: absen } = await supabase
      .from('absen')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('date', date)
      .single();

    if (!absen || absen.status !== 'h') {
      bot.sendMessage(chatId, "⚠️ Kamu tidak hadir hari ini");
      return;
    }

    const { data: existing } = await supabase
      .from('qc_logs')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .eq('date', date)
      .eq('type', type);

    if (existing && existing.length > 0) {
      bot.sendMessage(chatId, `⚠️ Sudah kirim ${type}`);
      return;
    }

    await supabase.from('qc_logs').insert({
      chat_id: chatId,
      user_id: userId,
      date,
      type
    });

    bot.sendMessage(chatId, `✅ QC ${type}`);
  } catch (err) {
    console.log(err);
  }
});

// ==========================
// 📊 DASHBOARD
// ==========================
bot.onText(/\/dashboard/, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const date = getToday();

    const { data: absen } = await supabase
      .from('absen')
      .select('*, users(name)')
      .eq('chat_id', chatId)
      .eq('date', date);

    const { data: qc } = await supabase
      .from('qc_logs')
      .select('*')
      .eq('chat_id', chatId)
      .eq('date', date);

    const map = {};

    (absen || []).forEach(a => {
      map[a.user_id] = {
        name: a.users?.name || a.user_id,
        status: a.status,
        before: false,
        after: false,
        total: 0
      };
    });

    (qc || []).forEach(q => {
      if (!map[q.user_id]) return;
      map[q.user_id][q.type] = true;
      map[q.user_id].total++;
    });

    let text = `📊 DASHBOARD (${date})\n\n`;

    for (let id in map) {
      const u = map[id];

      text += `${u.name}\n`;
      text += `Status: ${formatStatus(u.status)}\n`;
      text += `Before: ${u.before ? '✅' : '❌'} | `;
      text += `After: ${u.after ? '✅' : '❌'} | `;
      text += `Total: ${u.total}\n\n`;
    }

    bot.sendMessage(chatId, text);
  } catch (err) {
    console.log(err);
  }
});

// ==========================
// 🚨 AUTO CHECK
// ==========================
async function checkBelum(chatId) {
  try {
    const date = getToday();

    const { data: absen } = await supabase
      .from('absen')
      .select('*')
      .eq('chat_id', chatId)
      .eq('date', date);

    const { data: qc } = await supabase
      .from('qc_logs')
      .select('*')
      .eq('chat_id', chatId)
      .eq('date', date);

    const map = {};

    (absen || []).forEach(a => {
      if (a.status === 'h') {
        map[a.user_id] = { before: false, after: false };
      }
    });

    (qc || []).forEach(q => {
      if (!map[q.user_id]) return;
      map[q.user_id][q.type] = true;
    });

    const belum = Object.entries(map)
      .filter(([_, u]) => !u.before || !u.after)
      .map(([id]) => id);

    if (belum.length) {
      bot.sendMessage(chatId, `🚨 Belum lengkap:\n${belum.join(', ')}`);
    }
  } catch (err) {
    console.log(err);
  }
}

// ==========================
// ⏰ CRON
// ==========================
cron.schedule('0 10 * * *', () => {
  bot.sendMessage(process.env.GROUP_ID, "📋 Absen sekarang!\n/absen");
});

cron.schedule('0 13 * * *', () => {
  checkBelum(process.env.GROUP_ID);
});

// ==========================
// 👑 ADMIN
// ==========================
bot.onText(/\/reset/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;

  const chatId = msg.chat.id;
  const date = getToday();

  await supabase.from('absen').delete().eq('chat_id', chatId).eq('date', date);
  await supabase.from('qc_logs').delete().eq('chat_id', chatId).eq('date', date);

  bot.sendMessage(chatId, "🧹 Data hari ini direset");
});

//Http require
const http = require('http');

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("QC BOT RUNNING 🔥");
}).listen(PORT, () => {
  console.log("🌐 Server jalan di port", PORT);
});
// ==========================
console.log('🔥 BOT FINAL READY');
