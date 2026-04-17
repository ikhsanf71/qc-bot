const supabase = require('../../db');
const { getToday, formatStatus, escapeMarkdown } = require('../../utils');
const { evaluateUserPerformance } = require('./evaluationEngine');
const { calculateOutletScore } = require('./outletPerformance');
const { STATUS } = require('../config/constants');

async function generateDailyReport(outletId, outletName, date) {
  const { data: absenList } = await supabase
    .from('absen')
    .select(`telegram_id, status, created_at, users(full_name, phone)`)
    .eq('outlet_id', outletId)
    .eq('date', date);

  if (!absenList || absenList.length === 0)
    return `📭 *${escapeMarkdown(outletName)}* - ${date}\n_Tidak ada data absen._`;

  const { data: qcLogs } = await supabase
    .from('qc_logs')
    .select('telegram_id, type, treatment, start_time, end_time')
    .eq('outlet_id', outletId)
    .eq('date', date);

  const qcMap = {};
  qcLogs?.forEach(log => {
    if (!qcMap[log.telegram_id]) qcMap[log.telegram_id] = { before: false, after: false, treatment: null, start: null, end: null };
    if (log.type === 'before') {
      qcMap[log.telegram_id].before = true;
      qcMap[log.telegram_id].treatment = log.treatment;
      qcMap[log.telegram_id].start = log.start_time;
    } else if (log.type === 'after') {
      qcMap[log.telegram_id].after = true;
      qcMap[log.telegram_id].end = log.end_time;
    }
  });

  let report = `📊 *LAPORAN HARIAN* - ${escapeMarkdown(outletName)}\n📅 ${date}\n\n`;
  let hadirCount = 0, lengkapCount = 0, masalah = [];

  for (const absen of absenList) {
    const userId = absen.telegram_id;
    const userName = absen.users?.full_name || `User ${userId}`;
    const status = absen.status;
    const jamAbsen = absen.created_at ? new Date(absen.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-';

    if (status === STATUS.HADIR) {
      hadirCount++;
      const qc = qcMap[userId] || { before: false, after: false };
      const evaluation = evaluateUserPerformance(absen, qc);
      if (evaluation.status === 'PERFORM') lengkapCount++;

      report += `👤 *${escapeMarkdown(userName)}*\n`;
      report += `   ⏰ Absen: ${jamAbsen}\n`;
      report += `   📋 Status: ${formatStatus(status)}\n`;
      if (qc.treatment) report += `   💅 Treatment: ${escapeMarkdown(qc.treatment)}\n`;
      if (qc.start && qc.end) report += `   ⏱️  Durasi: ${qc.start} - ${qc.end}\n`;
      report += `   📸 QC: ${qc.before ? '✅ Before' : '❌ Before'} | ${qc.after ? '✅ After' : '❌ After'}\n`;
      report += `   🏷️  Performa: ${evaluation.status}\n\n`;

      if (evaluation.status !== 'PERFORM') {
        const kurang = [];
        if (!qc.before) kurang.push('Before');
        if (!qc.after) kurang.push('After');
        masalah.push(`• ${escapeMarkdown(userName)} — kurang: ${kurang.join(', ')}`);
      }
    } else {
      report += `👤 *${escapeMarkdown(userName)}*\n   ⏰ Absen: ${jamAbsen}\n   📋 Status: ${formatStatus(status)}\n\n`;
    }
  }

  if (masalah.length) report += `🚨 *MASALAH* (Belum Lengkap)\n${masalah.join('\n')}\n\n`;
  else if (hadirCount > 0) report += `✅ *Semua staff yang hadir sudah lengkap QC-nya!*\n\n`;

  const { score, category } = calculateOutletScore(hadirCount, lengkapCount);
  report += `📈 *SUMMARY*\n👥 Total Hadir: ${hadirCount}\n✅ QC Lengkap: ${lengkapCount}\n⚠️ Tidak Lengkap: ${hadirCount - lengkapCount}\n📊 Score Outlet: ${score} (${category})\n`;

  return report;
}

module.exports = { generateDailyReport };