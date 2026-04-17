/**
 * Progress Tracker Service
 * Menghitung performa mingguan staff dan menentukan trend
 */

const supabase = require('../../db');
const { getToday } = require('../../utils');

/**
 * Dapatkan tanggal mulai minggu (Senin) dan akhir minggu (Minggu)
 * @param {Date} date - Tanggal referensi
 * @returns {Object} { weekStart, weekEnd }
 */
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - diffToMonday);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  
  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: weekEnd.toISOString().split('T')[0]
  };
}

/**
 * Hitung performa staff untuk satu minggu
 * @param {number} telegramId 
 * @param {string} weekStart 
 * @param {string} weekEnd 
 * @returns {Promise<Object>} { totalHadir, totalLengkap, score }
 */
async function calculateWeeklyPerformance(telegramId, weekStart, weekEnd) {
  // Ambil semua absen dalam minggu
  const { data: absenList } = await supabase
    .from('absen')
    .select('status, date')
    .eq('telegram_id', telegramId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  // Ambil semua QC logs dalam minggu
  const { data: qcList } = await supabase
    .from('qc_logs')
    .select('type, date')
    .eq('telegram_id', telegramId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  if (!absenList || absenList.length === 0) {
    return { totalHadir: 0, totalLengkap: 0, score: 0 };
  }

  // Hitung hari hadir
  const hadirDates = new Set();
  absenList.forEach(a => {
    if (a.status === 'h') {
      hadirDates.add(a.date);
    }
  });
  const totalHadir = hadirDates.size;

  // Hitung QC lengkap per hari
  const qcMap = {};
  qcList?.forEach(q => {
    if (!qcMap[q.date]) qcMap[q.date] = { before: false, after: false };
    qcMap[q.date][q.type] = true;
  });

  let totalLengkap = 0;
  for (const date of hadirDates) {
    const qc = qcMap[date] || { before: false, after: false };
    if (qc.before && qc.after) {
      totalLengkap++;
    }
  }

  const score = totalHadir > 0 ? Math.round((totalLengkap / totalHadir) * 100) : 0;

  return { totalHadir, totalLengkap, score };
}

/**
 * Simpan progress ke database
 * @param {number} telegramId 
 * @param {string} weekStart 
 * @param {string} weekEnd 
 * @param {Object} performance 
 */
async function saveProgress(telegramId, weekStart, weekEnd, performance) {
  const { totalHadir, totalLengkap, score } = performance;
  
  // Cek apakah sudah ada
  const { data: existing } = await supabase
    .from('progress_tracking')
    .select('id, score')
    .eq('telegram_id', telegramId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    // Update jika sudah ada
    await supabase
      .from('progress_tracking')
      .update({
        week_end: weekEnd,
        total_hadir: totalHadir,
        total_lengkap: totalLengkap,
        score: score
      })
      .eq('id', existing.id);
    return { previousScore: existing.score, isNew: false };
  } else {
    // Insert baru
    await supabase
      .from('progress_tracking')
      .insert({
        telegram_id: telegramId,
        week_start: weekStart,
        week_end: weekEnd,
        total_hadir: totalHadir,
        total_lengkap: totalLengkap,
        score: score
      });
    return { previousScore: null, isNew: true };
  }
}

/**
 * Hitung trend antara minggu ini dan minggu lalu
 * @param {number} currentScore 
 * @param {number} previousScore 
 * @returns {string} 'up', 'stable', 'down'
 */
function calculateTrend(currentScore, previousScore) {
  if (previousScore === null || previousScore === undefined) return 'new';
  const diff = currentScore - previousScore;
  if (diff >= 5) return 'up';
  if (diff <= -5) return 'down';
  return 'stable';
}

/**
 * Proses semua staff di outlet dan update progress
 * @param {number} outletId 
 * @param {string} weekStart 
 * @param {string} weekEnd 
 * @returns {Promise<Array>} List staff dengan perubahan trend
 */
async function processOutletProgress(outletId, weekStart, weekEnd) {
  // Ambil semua staff di outlet
  const { data: staffList } = await supabase
    .from('outlet_members')
    .select('telegram_id, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('is_active', true)
    .eq('role', 'staff');

  if (!staffList || staffList.length === 0) return [];

  const results = [];

  for (const staff of staffList) {
    const performance = await calculateWeeklyPerformance(staff.telegram_id, weekStart, weekEnd);
    const { previousScore, isNew } = await saveProgress(staff.telegram_id, weekStart, weekEnd, performance);
    
    const trend = isNew ? 'new' : calculateTrend(performance.score, previousScore);
    
    results.push({
      telegram_id: staff.telegram_id,
      name: staff.users?.full_name || `User ${staff.telegram_id}`,
      score: performance.score,
      previousScore: previousScore || 0,
      trend,
      totalHadir: performance.totalHadir,
      totalLengkap: performance.totalLengkap
    });
  }

  return results;
}

module.exports = {
  getWeekRange,
  calculateWeeklyPerformance,
  saveProgress,
  calculateTrend,
  processOutletProgress
};