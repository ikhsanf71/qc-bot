const cron = require('node-cron');
const supabase = require('../../db');
const { getToday, escapeMarkdown } = require('../../utils');
const { generateDailyReport } = require('../services/reportGenerator');
const { sendSummarySignalToHQ } = require('../services/hqSender');
const { DAILY_REPORT_TIME } = require('../config/constants');

/**
 * Hitung statistik outlet untuk SUMMARY SIGNAL
 */
async function calculateOutletStats(outletId, date) {
  // Ambil semua staff outlet
  const { data: staffList } = await supabase
    .from('outlet_members')
    .select('telegram_id')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .eq('role', 'staff');
  
  const totalStaff = staffList?.length || 0;
  
  // Ambil data absen hari ini
  const { data: absenList } = await supabase
    .from('absen')
    .select('status')
    .eq('outlet_id', outletId)
    .eq('date', date);
  
  const totalHadir = absenList?.filter(a => a.status === 'h').length || 0;
  
  // Ambil data QC hari ini (hitung user yang punya both before & after)
  const { data: qcList } = await supabase
    .from('qc_logs')
    .select('telegram_id, type')
    .eq('outlet_id', outletId)
    .eq('date', date);
  
  const qcMap = {};
  qcList?.forEach(q => {
    if (!qcMap[q.telegram_id]) qcMap[q.telegram_id] = { before: false, after: false };
    if (q.type === 'before') qcMap[q.telegram_id].before = true;
    if (q.type === 'after') qcMap[q.telegram_id].after = true;
  });
  
  const totalLengkap = Object.values(qcMap).filter(u => u.before && u.after).length;
  const totalTidakLengkap = totalHadir - totalLengkap;
  
  // Hitung score
  let score = 0;
  let category = 'PROBLEM';
  if (totalHadir > 0) {
    score = Math.round((totalLengkap / totalHadir) * 100);
    if (score >= 85) category = 'EXCELLENT';
    else if (score >= 70) category = 'OK';
  }
  
  return {
    totalStaff,
    totalHadir,
    totalLengkap,
    totalTidakLengkap,
    score,
    category
  };
}

/**
 * Kirim laporan lengkap ke HQ (legacy, untuk detail)
 */
async function sendFullReport(bot, outlet, today, hqGroupId) {
  try {
    const report = await generateDailyReport(outlet.id, outlet.name, today);
    await bot.sendMessage(hqGroupId, report, { parse_mode: 'Markdown' });
    await new Promise(r => setTimeout(r, 500));
  } catch (err) {
    console.error(`Gagal kirim laporan outlet ${outlet.id}:`, err.message);
    await bot.sendMessage(hqGroupId, `❌ Gagal generate laporan untuk *${escapeMarkdown(outlet.name)}*.`, { parse_mode: 'Markdown' });
  }
}

/**
 * Kirim SUMMARY SIGNAL ke HQ (ringkas, untuk big picture)
 */
async function sendSummaryReports(bot, outlets, today, hqGroupId) {
  const summaryData = [];
  
  for (const outlet of outlets) {
    const stats = await calculateOutletStats(outlet.id, today);
    summaryData.push({
      name: outlet.name,
      ...stats
    });
  }
  
  // Kirim SUMMARY SIGNAL untuk semua outlet (ringkas)
  await sendSummarySignalToHQ(bot, summaryData, today);
}

/**
 * Kirim laporan harian ke HQ (FULL + SUMMARY)
 */
async function sendDailyReports(bot) {
  console.log('[CRON] 22:05 WIB — Mengirim laporan harian ke HQ');
  const today = getToday();
  const hqGroupId = process.env.HQ_GROUP_ID;
  
  if (!hqGroupId) {
    console.error('[DAILY REPORT] HQ_GROUP_ID tidak di set');
    return;
  }

  const { data: outlets } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true);
  
  if (!outlets || outlets.length === 0) {
    await bot.sendMessage(hqGroupId, '📭 Tidak ada outlet aktif hari ini.');
    return;
  }

  // 1. Kirim FULL REPORT (detail per outlet) - OPSIONAL, bisa dimatikan jika terlalu panjang
  // Untuk mengurangi spam, kita kirim ringkasan saja. Tapi biarkan dulu.
  for (const outlet of outlets) {
    await sendFullReport(bot, outlet, today, hqGroupId);
  }
  
  // 2. Kirim SUMMARY SIGNAL (ringkas, big picture)
  await sendSummaryReports(bot, outlets, today, hqGroupId);
  
  console.log(`[DAILY REPORT] Selesai. ${outlets.length} outlet dilaporkan.`);
}

/**
 * Register cron untuk laporan harian
 */
function registerDailyReportCron(bot) {
  cron.schedule(DAILY_REPORT_TIME, () => sendDailyReports(bot), { timezone: 'Asia/Jakarta' });
  console.log('⏰ Daily report cron registered (22:05 WIB)');
}

module.exports = { registerDailyReportCron, calculateOutletStats };