const { registerReminderCrons } = require('./reminders');
const { registerDailyReportCron } = require('./dailyReport');

function registerAllCrons(bot) {
  registerReminderCrons(bot);
  registerDailyReportCron(bot);
  console.log('⏰ All crons registered');
}

module.exports = { registerAllCrons };