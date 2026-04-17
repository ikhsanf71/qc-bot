/**
 * Cron Daily Reward
 * Berjalan setiap hari jam 23:00 WIB
 * Memberikan reward ke staff yang berprestasi
 */

const cron = require('node-cron');
const supabase = require('../../db');
const { getToday } = require('../../utils');
const { processOutletProgress } = require('../services/progressTracker');
const { generateOutletRewards } = require('../services/rewardEngine');
const { sendRewardToChannel } = require('../services/channelSender');
const { getPositiveMessage } = require('../services/messageBank');

/**
 * Proses reward untuk semua outlet
 * @param {TelegramBot} bot 
 */
async function processDailyRewards(bot) {
  console.log('[DAILY REWARD] Memulai proses reward harian...');
  
  const today = getToday();
  const { weekStart, weekEnd } = (() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - diffToMonday);
    return {
      weekStart: weekStartDate.toISOString().split('T')[0],
      weekEnd: today
    };
  })();
  
  // Ambil semua outlet aktif
  const { data: outlets } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true);
  
  if (!outlets || outlets.length === 0) {
    console.log('[DAILY REWARD] Tidak ada outlet aktif');
    return;
  }
  
  let totalRewards = 0;
  
  for (const outlet of outlets) {
    console.log(`[DAILY REWARD] Memproses outlet: ${outlet.name}`);
    
    // Dapatkan progress staff untuk minggu ini
    const progressResults = await processOutletProgress(outlet.id, weekStart, weekEnd);
    
    // Generate reward
    const rewards = await generateOutletRewards(outlet.id, outlet.name, progressResults, today);
    
    // Kirim reward ke channel
    for (const reward of rewards) {
      const message = getPositiveMessage(reward.rewardType);
      await sendRewardToChannel(bot, reward.name, reward.outletName, reward.rewardType, message);
      console.log(`[DAILY REWARD] ${reward.rewardType} untuk ${reward.name} di ${reward.outletName}`);
      totalRewards++;
      
      // Delay biar tidak kena rate limit
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`[DAILY REWARD] Selesai. Total reward dikirim: ${totalRewards}`);
}

/**
 * Register cron job untuk reward harian
 * Setiap hari jam 23:00 WIB = 16:00 UTC
 */
function registerDailyRewardCron(bot) {
  cron.schedule('0 16 * * *', async () => {
    console.log('[CRON] 23:00 WIB - Memproses reward harian');
    try {
      await processDailyRewards(bot);
    } catch (err) {
      console.error('[DAILY REWARD] Error:', err.message);
    }
  }, { timezone: 'Asia/Jakarta' });
  
  console.log('⏰ Daily reward cron registered (23:00 WIB)');
}

module.exports = { registerDailyRewardCron, processDailyRewards };