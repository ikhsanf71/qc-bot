const cron = require('node-cron');
const { REMINDER_TIMES } = require('../config/constants');
const { getOperationalOutlets, sendReminder } = require('../services/reminderService');

function registerReminderCrons(bot) {
  cron.schedule(REMINDER_TIMES.BEFORE, async () => {
    console.log('[CRON] 11:00 WIB — Reminder QC Before');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) await sendReminder(bot, outlet.id, 'before');
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule(REMINDER_TIMES.PROGRESS, async () => {
    console.log('[CRON] 14:00 WIB — Reminder Progress');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) await sendReminder(bot, outlet.id, 'progress');
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule(REMINDER_TIMES.AFTER, async () => {
    console.log('[CRON] 17:00 WIB — Reminder QC After');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) await sendReminder(bot, outlet.id, 'after');
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule(REMINDER_TIMES.WARNING, async () => {
    console.log('[CRON] 21:30 WIB — Warning Akhir Hari');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) await sendReminder(bot, outlet.id, 'warning');
  }, { timezone: 'Asia/Jakarta' });

  console.log('⏰ Reminder crons registered');
}

module.exports = { registerReminderCrons };