require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

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
const ADMINS = [5109637592]; // ganti dengan userId lo

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
  const userId = msg.from.id;
  const name = match[1].toLowerCase();

  await supabase.from('users').upsert({
    id: userId,
    name
  });

  bot.sendMessage(msg.chat.id, `✅ Terdaftar sebagai ${name}`);
});

// ==========================
// 📋 ABSEN BUTTON
// ==========================
bot.onText(/\/absen$/, async (msg) => {
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
});

// ==========================
// 🎯 HANDLE BUTTON ABSEN
// ==========================
bot.on('callback_query', async (q) => {
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
});

// ==========================
// 📋 ABSEN MANUAL (FALLBACK)
// ==========================
bot.onText(/\/absen (.+)/, async (msg, match) => {
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
});

// ==========================
// 📸 QC (BEFORE / AFTER)
// ==========================
bot.on('photo', async (msg) => {
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

  // cek status hadir
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

  // prevent double
  const { data: existing } = await supabase
    .from('qc_logs')
    .select('*')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('date', date)
    .eq('type', type);

  if (existing.length > 0) {
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
});

// ==========================
// 📊 DASHBOARD
// ==========================
bot.onText(/\/dashboard/, async (msg) => {
  const chatId = msg.chat.id;
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

  absen.forEach(a => {
    map[a.user_id] = {
      status: a.status,
      before: false,
      after: false,
      total: 0
    };
  });

  qc.forEach(q => {
    if (!map[q.user_id]) return;
    map[q.user_id][q.type] = true;
    map[q.user_id].total++;
  });

  let text = `📊 DASHBOARD (${date})\n\n`;

  for (let id in map) {
    const u = map[id];

    text += `${id}\n`;
    text += `Status: ${formatStatus(u.status)}\n`;
    text += `Before: ${u.before ? '✅' : '❌'} | `;
    text += `After: ${u.after ? '✅' : '❌'} | `;
    text += `Total: ${u.total}\n\n`;
  }

  bot.sendMessage(chatId, text);
});

// ==========================
// 🚨 AUTO TAG
// ==========================
async function checkBelum(chatId) {
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

  absen.forEach(a => {
    if (a.status === 'h') {
      map[a.user_id] = { before: false, after: false };
    }
  });

  qc.forEach(q => {
    if (!map[q.user_id]) return;
    map[q.user_id][q.type] = true;
  });

  const belum = Object.entries(map)
    .filter(([_, u]) => !u.before || !u.after)
    .map(([id]) => id);

  if (belum.length) {
    bot.sendMessage(chatId, `🚨 Belum lengkap:\n${belum.join(', ')}`);
  }
}

// ==========================
// ⏰ CRON
// ==========================
cron.schedule('0 10 * * *', async () => {
  bot.sendMessage(
    process.env.GROUP_ID,
    "📋 Absen sekarang!\n/absen"
  );
});

cron.schedule('0 13 * * *', async () => {
  checkBelum(process.env.GROUP_ID);
});

// ==========================
// 👑 ADMIN COMMAND
// ==========================
bot.onText(/\/reset/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;

  const chatId = msg.chat.id;
  const date = getToday();

  await supabase.from('absen').delete().eq('chat_id', chatId).eq('date', date);
  await supabase.from('qc_logs').delete().eq('chat_id', chatId).eq('date', date);

  bot.sendMessage(chatId, "🧹 Data hari ini direset");
});

console.log('🔥 BOT CLOUD READY');