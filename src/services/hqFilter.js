const supabase = require('../../db');
const { getToday } = require('../../utils');
const { getUserQCStatus } = require('./qcValidator');
const { STATUS } = require('../config/constants');

async function shouldForwardToHQ(outletId, userId, type) {
  if (type !== 'after') return false;
  const today = getToday();
  const { isComplete } = await getUserQCStatus(outletId, userId, today);
  return !isComplete; // hanya kirim jika belum lengkap (prioritas)
}

async function generateHQProblemSummary(outletId, outletName, date) {
  const { data: absenList } = await supabase
    .from('absen')
    .select(`telegram_id, status, users(full_name)`)
    .eq('outlet_id', outletId)
    .eq('date', date);
  if (!absenList || absenList.length === 0) return null;

  const { data: qcLogs } = await supabase
    .from('qc_logs')
    .select('telegram_id, type, parsed')
    .eq('outlet_id', outletId)
    .eq('date', date);

  const { data: skipLogs } = await supabase
    .from('qc_skips')
    .select('telegram_id, reason')
    .eq('outlet_id', outletId)
    .eq('date', date);

  const qcMap = {};
  qcLogs?.forEach(log => {
    if (!qcMap[log.telegram_id]) qcMap[log.telegram_id] = { before: false, after: false, formatError: !log.parsed };
    if (log.type === 'before') qcMap[log.telegram_id].before = true;
    if (log.type === 'after') qcMap[log.telegram_id].after = true;
  });
  const skipMap = {};
  skipLogs?.forEach(s => { skipMap[s.telegram_id] = s.reason; });

  let masalah = [], tidakHadir = [];

  for (const absen of absenList) {
    const userId = absen.telegram_id;
    const userName = absen.users?.full_name || `User ${userId}`;
    const status = absen.status;
    const qc = qcMap[userId] || { before: false, after: false, formatError: false };
    const skipReason = skipMap[userId];

    if (status === STATUS.HADIR) {
      if (!qc.before && !qc.after && !skipReason) masalah.push(`• ${userName} — TIDAK ADA FOTO & TIDAK SKIP`);
      else if (!qc.before && !qc.after && skipReason) masalah.push(`• ${userName} — SKIP: ${skipReason.substring(0, 50)}`);
      else if (qc.before && !qc.after) masalah.push(`• ${userName} — HANYA BEFORE, BELUM AFTER`);
      else if (!qc.before && qc.after) masalah.push(`• ${userName} — HANYA AFTER (TANPA BEFORE) ⚠️ PRIORITAS`);
      else if (qc.formatError) masalah.push(`• ${userName} — FORMAT FOTO SALAH`);
    } else {
      const statusText = status === STATUS.IZIN ? 'Izin' : (status === STATUS.SAKIT ? 'Sakit' : 'Libur');
      tidakHadir.push(`• ${userName} — ${statusText}`);
    }
  }

  if (masalah.length === 0 && tidakHadir.length === 0) return null;

  let summary = `⚠️ *MASALAH HARIAN* - ${outletName}\n📅 ${date}\n\n`;
  if (masalah.length) summary += `*🔴 PRIORITAS:*\n${masalah.join('\n')}\n\n`;
  if (tidakHadir.length) summary += `*🟡 Tidak Hadir:*\n${tidakHadir.join('\n')}\n\n`;
  summary += `📌 Foto AFTER prioritas dikirim terpisah.`;
  return summary;
}

module.exports = { shouldForwardToHQ, generateHQProblemSummary };