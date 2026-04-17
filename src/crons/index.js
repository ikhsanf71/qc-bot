/**
 * Cron Jobs Index
 * Menggabungkan semua cron jobs
 */

const { registerReminderCrons } = require('./reminders');
const { registerDailyReportCron } = require('./dailyReport');
const { registerWeeklyProgressCron } = require('./weeklyProgress');
const { registerDailyRewardCron } = require('./dailyReward');

function registerAllCrons(bot) {
  // Cron yang sudah ada
  registerReminderCrons(bot);
  registerDailyReportCron(bot);
  
  // Cron baru untuk Channel Learning System
  registerWeeklyProgressCron(bot);
  registerDailyRewardCron(bot);
  
  console.log('⏰ All crons registered (reminder, report, weekly, reward)');
}

module.exports = { registerAllCrons };