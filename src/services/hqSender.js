// src/services/hqSender.js
const { escapeMarkdown } = require('../../utils');

// Rate limiting sederhana untuk mencegah spam ke HQ
const lastSentMap = new Map();
const MIN_INTERVAL_MS = 2000; // Minimal 2 detik antar pesan

/**
 * Cek apakah sudah boleh kirim pesan lagi (rate limiting)
 */
async function canSendMessage() {
  const now = Date.now();
  const lastSent = lastSentMap.get('hq_last_sent') || 0;
  if (now - lastSent < MIN_INTERVAL_MS) {
    return false;
  }
  lastSentMap.set('hq_last_sent', now);
  return true;
}

/**
 * Format pesan ISSUE SIGNAL
 */
function formatIssueSignal(userName, outletName, reason, treatment = null, timeRange = null) {
  let message = `🚨 *ISSUE SIGNAL*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `👤 *Nama:* ${escapeMarkdown(userName)}\n`;
  message += `📍 *Outlet:* ${escapeMarkdown(outletName)}\n`;
  message += `❌ *Masalah:* ${reason}\n`;
  if (treatment) message += `💅 *Treatment:* ${escapeMarkdown(treatment)}\n`;
  if (timeRange) message += `⏰ *Waktu:* ${timeRange}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⚠️ Perlu perhatian dan tindak lanjut.`;
  return message;
}

/**
 * Format pesan QUALITY SIGNAL (sample QC lengkap)
 */
function formatQualitySignal(userName, outletName, treatment, timeRange, isFirst = false) {
  const prefix = isFirst ? '🔥 *FIRST QC TODAY*' : '📸 *QUALITY SAMPLE*';
  let message = `${prefix}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `👤 *Nama:* ${escapeMarkdown(userName)}\n`;
  message += `📍 *Outlet:* ${escapeMarkdown(outletName)}\n`;
  message += `💅 *Treatment:* ${escapeMarkdown(treatment)}\n`;
  message += `⏰ *Waktu:* ${timeRange}\n`;
  message += `✅ *Status:* QC lengkap (Before + After)\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📌 Standar kerja normal. Pertahankan!`;
  return message;
}

/**
 * Format pesan SUMMARY SIGNAL (laporan ringkas semua outlet)
 */
function formatSummarySignal(outletStats, date) {
  if (!outletStats || outletStats.length === 0) {
    return `📊 *SUMMARY SIGNAL* - ${date}\n━━━━━━━━━━━━━━━━━━━━━━━\nTidak ada data outlet.`;
  }
  
  // Urutkan berdasarkan score (tertinggi ke terendah)
  const sorted = [...outletStats].sort((a, b) => b.score - a.score);
  
  let message = `📊 *SUMMARY SIGNAL* - ${date}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  for (const outlet of sorted) {
    let emoji = '🟢';
    if (outlet.category === 'PROBLEM') emoji = '🔴';
    else if (outlet.category === 'EXCELLENT') emoji = '🔥';
    
    message += `🏪 *${escapeMarkdown(outlet.name)}*\n`;
    message += `   👥 Hadir: ${outlet.totalHadir}/${outlet.totalStaff || outlet.totalHadir}\n`;
    message += `   ✅ Lengkap: ${outlet.totalLengkap}\n`;
    message += `   📊 Score: ${outlet.score}% ${emoji} (${outlet.category})\n\n`;
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📌 *Keterangan:*\n`;
  message += `   🔥 EXCELLENT (≥85%)\n`;
  message += `   🟢 OK (70-84%)\n`;
  message += `   🔴 PROBLEM (<70%)\n`;
  
  return message;
}

/**
 * Kirim pesan ke grup HQ (dengan rate limiting)
 */
async function sendToHQ(bot, message, parseMode = 'Markdown') {
  const hqGroupId = process.env.HQ_GROUP_ID;
  if (!hqGroupId) {
    console.error('[HQ SENDER] HQ_GROUP_ID tidak diset');
    return false;
  }
  
  // Rate limiting: jangan kirim terlalu cepat
  const canSend = await canSendMessage();
  if (!canSend) {
    console.log('[HQ SENDER] Rate limited, menunggu...');
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS));
  }
  
  try {
    await bot.sendMessage(hqGroupId, message, { parse_mode: parseMode });
    console.log('[HQ SENDER] Pesan terkirim ke HQ');
    return true;
  } catch (err) {
    console.error('[HQ SENDER] Error:', err.message);
    return false;
  }
}

/**
 * Kirim SUMMARY SIGNAL ke HQ (ringkasan semua outlet)
 */
async function sendSummarySignalToHQ(bot, outletStats, date) {
  const message = formatSummarySignal(outletStats, date);
  return await sendToHQ(bot, message);
}

/**
 * Kirim ISSUE SIGNAL ke HQ
 */
async function sendIssueSignalToHQ(bot, userName, outletName, reason, treatment = null, timeRange = null) {
  const message = formatIssueSignal(userName, outletName, reason, treatment, timeRange);
  return await sendToHQ(bot, message);
}

/**
 * Kirim QUALITY SIGNAL ke HQ
 */
async function sendQualitySignalToHQ(bot, userName, outletName, treatment, timeRange, isFirst = false) {
  const message = formatQualitySignal(userName, outletName, treatment, timeRange, isFirst);
  return await sendToHQ(bot, message);
}

module.exports = { 
  formatIssueSignal, 
  formatQualitySignal, 
  formatSummarySignal,
  sendToHQ,
  sendSummarySignalToHQ,
  sendIssueSignalToHQ,
  sendQualitySignalToHQ
};