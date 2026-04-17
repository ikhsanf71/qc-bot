// src/crons/resetCache.js
const { resetQualityCache } = require('../services/qualityQueue');

cron.schedule('0 0 * * *', () => {
  resetQualityCache();
  console.log('[CRON] Quality cache direset');
}, { timezone: 'Asia/Jakarta' });