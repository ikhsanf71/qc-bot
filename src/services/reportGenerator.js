const supabase = require('../../db');
const { getToday, formatStatus, escapeMarkdown } = require('../../utils');
const { evaluateUserPerformance } = require('./evaluationEngine');
const { calculateOutletScore } = require('./outletPerformance');
const { STATUS } = require('../config/constants');

async function generateDailyReport(outletId, outletName, date) {
  // Ambil semua staff aktif di outlet (bukan hanya yang absen)
  const { data: allStaff } = await supabase
    .from('outlet_members')
    .select('telegram_id, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .eq('role', 'staff');

  if (!allStaff || allStaff.length === 0) {
    return `📊 *${escapeMarkdown(outletName)}* - ${date}\n_Tidak ada staff terdaftar._`;
  }

  // Ambil data absen
  const { data: absenList } = await supabase
    .from('absen')
    .select('telegram_id, status, created_at, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', date);

  // Ambil QC logs
  const { data: qcLogs } = await supabase
    .from('qc_logs')
    .select('telegram_id, type, treatment, start_time, end_time')
    .eq('outlet_id', outletId)
    .eq('date', date);

  // Map QC per user
  const qcMap = {};
  qcLogs?.forEach(log => {
    if (!qcMap[log.telegram_id]) {
      qcMap[log.telegram_id] = { before: false, after: false, treatment: null, start: null, end: null };
    }
    if (log.type === 'before') {
      qcMap[log.telegram_id].before = true;
      qcMap[log.telegram_id].treatment = log.treatment;
      qcMap[log.telegram_id].start = log.start_time;
    } else if (log.type === 'after') {
      qcMap[log.telegram_id].after = true;
      qcMap[log.telegram_id].end = log.end_time;
    }
  });

  // Map absen per user
  const absenMap = {};
  absenList?.forEach(absen => {
    absenMap[absen.telegram_id] = absen;
  });

  // Identifikasi staff yang tidak absen
  const absenUserIds = new Set(absenList?.map(a => a.telegram_id) || []);
  const tidakAbsen = allStaff.filter(s => !absenUserIds.has(s.telegram_id));

  let report = `📊 *${escapeMarkdown(outletName)}* — ${date}\n`;
  report += `👥 Total Staff: ${allStaff.length} | ✅ Hadir: ${absenList?.filter(a => a.status === 'h').length || 0}`;
  if (tidakAbsen.length > 0) report += ` | 📝 Tidak Absen: ${tidakAbsen.length}`;
  report += `\n\n`;

  let hadirCount = 0;
  let lengkapCount = 0;
  let normalCount = 0;
  let warningCount = 0;

  // Loop staff yang hadir
  for (const staff of allStaff) {
    const userId = staff.telegram_id;
    const userName = staff.users?.full_name || `User ${userId}`;
    const absen = absenMap[userId];
    const qc = qcMap[userId] || { before: false, after: false };

    if (!absen) {
      // Staff tidak absen (akan ditampilkan di bagian terpisah)
      continue;
    }

    const status = absen.status;
    const jamAbsen = absen.created_at ? new Date(absen.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '-';

    if (status === 'h') {
      hadirCount++;
      const isComplete = qc.before && qc.after;
      if (isComplete) {
        lengkapCount++;
        report += `✅ *${escapeMarkdown(userName)}* — ${qc.treatment || '-'} (${qc.start || '-'}-${qc.end || '-'})\n`;
      } else if (qc.before || qc.after) {
        normalCount++;
        const kurang = [];
        if (!qc.before) kurang.push('Before');
        if (!qc.after) kurang.push('After');
        report += `⚠️ *${escapeMarkdown(userName)}* — kurang: ${kurang.join(', ')}`;
        if (qc.treatment) report += ` (${qc.treatment})`;
        report += `\n`;
      } else {
        warningCount++;
        report += `❌ *${escapeMarkdown(userName)}* — TIDAK ADA FOTO\n`;
      }
    } else {
      // Tidak hadir (izin/sakit/libur)
      const statusText = status === 'i' ? 'Izin' : (status === 's' ? 'Sakit' : 'Libur');
      report += `⚪ *${escapeMarkdown(userName)}* — ${statusText} (absen: ${jamAbsen})\n`;
    }
  }

  // Tambahkan staff yang tidak absen
  if (tidakAbsen.length > 0) {
    report += `\n🚨 *TIDAK ABSEN (TANPA KETERANGAN)*\n`;
    tidakAbsen.forEach(staff => {
      const userName = staff.users?.full_name || `User ${staff.telegram_id}`;
      report += `• ${escapeMarkdown(userName)}\n`;
    });
  }

  // Summary
  const totalHadir = hadirCount;
  const totalLengkap = lengkapCount;
  const totalTidakLengkap = normalCount + warningCount;
  const persenDisiplin = totalHadir > 0 ? Math.round((totalLengkap / totalHadir) * 100) : 0;
  let kategori = 'PROBLEM';
  if (persenDisiplin >= 85) kategori = 'EXCELLENT';
  else if (persenDisiplin >= 70) kategori = 'OK';

  report += `\n📈 *SUMMARY*\n`;
  report += `👥 Hadir: ${totalHadir} | ✅ Lengkap: ${totalLengkap}\n`;
  report += `⚠️ Tidak Lengkap: ${totalTidakLengkap} | 🚫 Tidak Absen: ${tidakAbsen.length}\n`;
  report += `📊 Score: ${persenDisiplin}% (${kategori})\n`;

  return report;
  
}
module.exports = { generateDailyReport };