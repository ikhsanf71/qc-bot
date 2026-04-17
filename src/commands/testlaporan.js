const { generateDailyReport } = require('../services/reportGenerator');
const { getToday } = require('../../utils');
const supabase = require('../../db');
const { isOwner } = require('../middleware');

async function handleTestLaporan(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa menggunakan command ini.');
  }

  const today = getToday();
  await bot.sendMessage(chatId, '⏳ Generating laporan harian...');

  const { data: outlets } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true);

  if (!outlets || outlets.length === 0) {
    return bot.sendMessage(chatId, '❌ Belum ada outlet terdaftar.');
  }

  for (const outlet of outlets) {
    try {
      const report = await generateDailyReport(outlet.id, outlet.name, today);
      await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error report ${outlet.name}:`, err.message);
      await bot.sendMessage(chatId, `❌ Gagal generate laporan untuk *${escapeMarkdown(outlet.name)}*.`, { parse_mode: 'Markdown' });
    }
  }

  await bot.sendMessage(chatId, '✅ Selesai!');
}

function register(bot) {
  bot.onText(/\/testlaporan/, (msg) => handleTestLaporan(bot, msg));
}

module.exports = { register };