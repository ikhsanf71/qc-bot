const cron = require('node-cron');
const supabase = require('../../db');
const { getToday, escapeMarkdown } = require('../../utils');
const { generateDailyReport } = require('../services/reportGenerator');
const { generateHQProblemSummary } = require('../services/hqFilter');
const { DAILY_REPORT_TIME } = require('../config/constants');

async function sendDailyReports(bot) {
  console.log('[CRON] 22:05 WIB — Mengirim laporan harian ke HQ');
  const today = getToday();
  const hqGroupId = process.env.HQ_GROUP_ID;
  if (!hqGroupId) { console.error('HQ_GROUP_ID tidak di set'); return; }

  const { data: outlets } = await supabase.from('outlets').select('id, name').eq('is_active', true);
  if (!outlets || outlets.length === 0) { await bot.sendMessage(hqGroupId, '📭 Tidak ada outlet aktif hari ini.'); return; }

  for (const outlet of outlets) {
    try {
      const report = await generateDailyReport(outlet.id, outlet.name, today);
      await bot.sendMessage(hqGroupId, report, { parse_mode: 'Markdown' });
      await new Promise(r => setTimeout(r, 500));
      const problemSummary = await generateHQProblemSummary(outlet.id, outlet.name, today);
      if (problemSummary) {
        await bot.sendMessage(hqGroupId, problemSummary, { parse_mode: 'Markdown' });
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error(`Gagal kirim laporan outlet ${outlet.id}:`, err.message);
      await bot.sendMessage(hqGroupId, `❌ Gagal generate laporan untuk *${escapeMarkdown(outlet.name)}*.`, { parse_mode: 'Markdown' });
    }
  }
}

function registerDailyReportCron(bot) {
  cron.schedule(DAILY_REPORT_TIME, () => sendDailyReports(bot), { timezone: 'Asia/Jakarta' });
  console.log('⏰ Daily report cron registered (22:05 WIB)');
}

module.exports = { registerDailyReportCron };