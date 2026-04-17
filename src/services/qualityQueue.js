// src/services/qualityQueue.js
const supabase = require('../../db');

// In-memory cache untuk tracking sample QUALITY per outlet per hari
// Redis lebih bagus untuk production, tapi ini cukup untuk skala kecil
const qualitySampleCache = new Map();

/**
 * Cek apakah outlet sudah mencapai limit sample QUALITY hari ini
 * @param {number} outletId 
 * @param {string} date 
 * @param {number} limit - default 2 sample per hari
 * @returns {Promise<boolean>}
 */
async function canSendQualitySample(outletId, date, limit = 2) {
  const key = `${outletId}:${date}`;
  
  if (!qualitySampleCache.has(key)) {
    // Hitung dari database juga (untuk persistensi jika bot restart)
    const { count } = await supabase
      .from('qc_logs')
      .select('id', { count: 'exact', head: true })
      .eq('outlet_id', outletId)
      .eq('date', date)
      .eq('is_quality_sent', true);
    
    qualitySampleCache.set(key, count || 0);
  }
  
  const currentCount = qualitySampleCache.get(key);
  return currentCount < limit;
}

/**
 * Tandai sample QUALITY sudah dikirim
 */
async function markQualitySent(outletId, userId, date, qcLogId) {
  const key = `${outletId}:${date}`;
  const currentCount = qualitySampleCache.get(key) || 0;
  qualitySampleCache.set(key, currentCount + 1);
  
  // Update database (perlu tambah kolom is_quality_sent)
  await supabase
    .from('qc_logs')
    .update({ is_quality_sent: true })
    .eq('id', qcLogId);
}

/**
 * Reset cache (bisa dipanggil setiap jam 00:00)
 */
function resetQualityCache() {
  qualitySampleCache.clear();
}

module.exports = { canSendQualitySample, markQualitySent, resetQualityCache };