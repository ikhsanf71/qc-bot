/**
 * /testprogress
 * Command untuk test progress system dan reward system manual
 * Hanya bisa diakses oleh owner/trainer
 */

const supabase = require('../../db');
const { commandPattern } = require('../../utils');
const { isTrainer } = require('../middleware/trainerOnly');
const { processWeeklyProgress } = require('../crons/weeklyProgress');
const { processDailyRewards } = require('../crons/dailyReward');

async function handleTestProgress(bot, msg, match) {
  // Validasi awal
  if (!msg || !msg.from || !msg.chat) {
    console.error('[TESTPROGRESS] Invalid message object');
    return;
  }

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Cek apakah user adalah trainer atau owner
  if (!isTrainer(userId)) {
    console.log(`[TESTPROGRESS] User ${userId} bukan trainer, akses ditolak`);
    return;
  }

  // Ambil sub command dari match
  const fullText = match[0] || '';
  const parts = fullText.split(' ');
  const subCommand = parts[1]?.toLowerCase() || '';
  const param = parts[2];

  if (!subCommand) {
    return bot.sendMessage(chatId, 
      `📋 *Test Progress System*\n\n` +
      `• /testprogress week - Test progress mingguan\n` +
      `• /testprogress reward - Test reward harian\n` +
      `• /testprogress all - Test semua\n` +
      `• /testprogress staff <id> - Cek performa staff\n` +
      `• /testprogress outlet <id> - Cek performa outlet`,
      { parse_mode: 'Markdown' }
    );
  }
  
  if (subCommand === 'week' || subCommand === 'all') {
    await bot.sendMessage(chatId, '⏳ Memproses progress mingguan...');
    try {
      await processWeeklyProgress(bot);
      await bot.sendMessage(chatId, '✅ Progress mingguan selesai! Cek channel.');
    } catch (err) {
      console.error('[TESTPROGRESS] Error week:', err.message);
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  }
  
  if (subCommand === 'reward' || subCommand === 'all') {
    await bot.sendMessage(chatId, '⏳ Memproses reward harian...');
    try {
      await processDailyRewards(bot);
      await bot.sendMessage(chatId, '✅ Reward harian selesai! Cek channel.');
    } catch (err) {
      console.error('[TESTPROGRESS] Error reward:', err.message);
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  }
  
  if (subCommand === 'staff' && param) {
    const staffId = parseInt(param);
    if (isNaN(staffId)) {
      return bot.sendMessage(chatId, '❌ Format: /testprogress staff <telegram_id>');
    }
    
    const { getWeekRange, calculateWeeklyPerformance } = require('../services/progressTracker');
    const { weekStart, weekEnd } = getWeekRange();
    
    const performance = await calculateWeeklyPerformance(staffId, weekStart, weekEnd);
    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('telegram_id', staffId)
      .maybeSingle();
    
    await bot.sendMessage(chatId,
      `📊 *Performa Staff*\n\n` +
      `👤 Nama: ${user?.full_name || `User ${staffId}`}\n` +
      `📅 Periode: ${weekStart} - ${weekEnd}\n` +
      `✅ Total Hadir: ${performance.totalHadir}\n` +
      `📸 QC Lengkap: ${performance.totalLengkap}\n` +
      `📈 Score: ${performance.score}%`,
      { parse_mode: 'Markdown' }
    );
  }
  
  if (subCommand === 'outlet' && param) {
    const outletId = parseInt(param);
    if (isNaN(outletId)) {
      return bot.sendMessage(chatId, '❌ Format: /testprogress outlet <outlet_id>');
    }
    
    const { getWeekRange, processOutletProgress } = require('../services/progressTracker');
    const { weekStart, weekEnd } = getWeekRange();
    
    const results = await processOutletProgress(outletId, weekStart, weekEnd);
    const { data: outlet } = await supabase
      .from('outlets')
      .select('name')
      .eq('id', outletId)
      .maybeSingle();
    
    let message = `📊 *Performa Outlet ${outlet?.name || outletId}*\n`;
    message += `📅 ${weekStart} - ${weekEnd}\n\n`;
    
    for (const staff of results.slice(0, 10)) {
      const emoji = staff.trend === 'up' ? '📈' : (staff.trend === 'stable' ? '👌' : '📉');
      message += `${emoji} ${staff.name}: ${staff.score}% (${staff.trend})\n`;
    }
    
    if (results.length > 10) message += `\n... dan ${results.length - 10} staff lainnya`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }
}

function register(bot) {
  bot.onText(commandPattern('testprogress'), (msg, match) => {
    handleTestProgress(bot, msg, match);
  });
}

module.exports = { register };