/**
 * Cron Weekly Progress
 * Berjalan setiap hari Senin jam 08:00 WIB
 * Menghitung progress staff dan mengirim ke channel
 */

const cron = require('node-cron');
const supabase = require('../../db');
const { getWeekRange, processOutletProgress } = require('../services/progressTracker');
const { sendProgressToChannel } = require('../services/channelSender');
const { getPositiveMessage } = require('../services/messageBank');

/**
 * Proses semua outlet dan kirim progress ke channel
 * @param {TelegramBot} bot 
 */
async function processWeeklyProgress(bot) {
  console.log('[WEEKLY PROGRESS] Memulai proses progress mingguan...');
  
  const { weekStart, weekEnd } = getWeekRange();
  console.log(`[WEEKLY PROGRESS] Periode: ${weekStart} - ${weekEnd}`);
  
  // Ambil semua outlet aktif
  const { data: outlets } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true);
  
  if (!outlets || outlets.length === 0) {
    console.log('[WEEKLY PROGRESS] Tidak ada outlet aktif');
    return;
  }
  
  let totalProgress = 0;
  let totalUp = 0;
  let totalStable = 0;
  
  for (const outlet of outlets) {
    console.log(`[WEEKLY PROGRESS] Memproses outlet: ${outlet.name}`);
    
    const results = await processOutletProgress(outlet.id, weekStart, weekEnd);
    
    for (const staff of results) {
      totalProgress++;
      
      // Kirim ke channel hanya jika trend 'up' atau 'stable'
      // Jangan kirim 'down' atau 'new'
      if (staff.trend === 'up') {
        totalUp++;
        const message = getPositiveMessage('progress_up');
        await sendProgressToChannel(bot, staff.name, outlet.name, 'up', message);
        console.log(`[WEEKLY PROGRESS] Progress UP: ${staff.name} (${staff.score}%)`);
      } else if (staff.trend === 'stable' && staff.score > 0) {
        totalStable++;
        const message = getPositiveMessage('progress_stable');
        await sendProgressToChannel(bot, staff.name, outlet.name, 'stable', message);
        console.log(`[WEEKLY PROGRESS] Progress STABLE: ${staff.name} (${staff.score}%)`);
      }
      
      // Delay biar tidak kena rate limit
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  console.log(`[WEEKLY PROGRESS] Selesai. Total: ${totalProgress}, UP: ${totalUp}, STABLE: ${totalStable}`);
}

/**
 * Register cron job untuk progress mingguan
 * Setiap Senin jam 08:00 WIB = 01:00 UTC
 */
function registerWeeklyProgressCron(bot) {
  cron.schedule('0 1 * * 1', async () => {
    console.log('[CRON] Senin 08:00 WIB - Memproses progress mingguan');
    try {
      await processWeeklyProgress(bot);
    } catch (err) {
      console.error('[WEEKLY PROGRESS] Error:', err.message);
    }
  }, { timezone: 'Asia/Jakarta' });
  
  console.log('⏰ Weekly progress cron registered (Senin 08:00 WIB)');
}

module.exports = { registerWeeklyProgressCron, processWeeklyProgress };