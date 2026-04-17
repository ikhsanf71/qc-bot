// src/services/hqFilter.js
const { classifySignal } = require('./signalClassifier');
const { canSendQualitySample, markQualitySent } = require('./qualityQueue');
const { formatIssueSignal, formatQualitySignal, sendToHQ } = require('./hqSender');

/**
 * Proses dan kirim ke HQ berdasarkan klasifikasi sinyal
 * @returns {Promise<boolean>} apakah sudah dikirim
 */
async function processAndSendToHQ(bot, outletId, userId, userName, qcData, date, qcLogId) {
  const { type, reason, metadata } = await classifySignal(outletId, userId, qcData, date);
  const { outletName, treatment, startTime, endTime } = qcData;
  const timeRange = startTime && endTime ? `${startTime}-${endTime}` : null;
  
  // 🔴 ISSUE SIGNAL: WAJIB KIRIM
  if (type === 'ISSUE') {
    const message = formatIssueSignal(userName, outletName, reason, treatment, timeRange);
    await sendToHQ(bot, message);
    console.log(`[HQ] ISSUE dikirim: ${userName} - ${reason}`);
    return true;
  }
  
  // 🟢 QUALITY SIGNAL: kirim jika belum mencapai limit
  if (type === 'QUALITY') {
    const canSend = await canSendQualitySample(outletId, date, 2); // max 2 sample per hari
    if (canSend) {
      // Cek apakah ini sample pertama hari ini (untuk kasih badge "FIRST QC")
      const isFirst = await isFirstQualityToday(outletId, date);
      const message = formatQualitySignal(userName, outletName, treatment, timeRange, isFirst);
      await sendToHQ(bot, message);
      await markQualitySent(outletId, userId, date, qcLogId);
      console.log(`[HQ] QUALITY dikirim: ${userName} (sample ke-${await getQualityCount(outletId, date)})`);
      return true;
    } else {
      console.log(`[HQ] QUALITY di-IGNORE (limit tercapai): ${userName}`);
    }
  }
  
  // ⚪ IGNORE
  console.log(`[HQ] IGNORE: ${userName} - ${reason || 'Not priority'}`);
  return false;
}

// Helper functions
async function isFirstQualityToday(outletId, date) {
  const { count } = await supabase
    .from('qc_logs')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('date', date)
    .eq('is_quality_sent', true);
  return count === 0;
}

async function getQualityCount(outletId, date) {
  const { count } = await supabase
    .from('qc_logs')
    .select('id', { count: 'exact', head: true })
    .eq('outlet_id', outletId)
    .eq('date', date)
    .eq('is_quality_sent', true);
  return count || 0;
}

module.exports = { processAndSendToHQ };