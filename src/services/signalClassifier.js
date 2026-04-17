// src/services/signalClassifier.js
const { getUserQCStatus } = require('./qcValidator');

/**
 * Klasifikasi sinyal berdasarkan data QC
 * @returns {Object} { type, reason }
 */
async function classifySignal(outletId, userId, qcData, date) {
  const { type, treatment, startTime, endTime, outletName } = qcData;
  const { hasBefore, hasAfter, isComplete } = await getUserQCStatus(outletId, userId, date);
  
  // 🔴 ISSUE SIGNAL
  if (type === 'after' && !hasBefore) {
    return { type: 'ISSUE', reason: 'AFTER tanpa BEFORE' };
  }
  
  // 🔴 ISSUE: Tidak ada QC sama sekali (akan ditangani di cron summary)
  // Tapi untuk real-time, kita handle di sini juga
  if (type === 'skip' || (type === 'after' && !hasBefore)) {
    return { type: 'ISSUE', reason: 'Tidak ada QC lengkap' };
  }
  
  // 🟢 QUALITY SIGNAL (QC lengkap)
  if (isComplete && type === 'after') {
    return { 
      type: 'QUALITY', 
      reason: 'QC lengkap',
      metadata: { treatment, startTime, endTime, outletName }
    };
  }
  
  // ⚪ IGNORE (before, atau after dari user yang sudah lengkap)
  return { type: 'IGNORE', reason: 'Not priority' };
}

module.exports = { classifySignal };