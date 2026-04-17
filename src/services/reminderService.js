const supabase = require('../../db');
const { getToday, mentionUser } = require('../../utils');
const { getUserQCStatus } = require('./qcValidator');
const { STATUS } = require('../config/constants');

async function getOperationalOutlets() {
  const { data } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_operational', true);
  return data || [];
}

async function sendReminder(bot, outletId, type) {
  const today = getToday();
  const { data: hadirList } = await supabase
    .from('absen')
    .select('telegram_id, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', today)
    .eq('status', STATUS.HADIR);

  if (!hadirList || hadirList.length === 0) return;

  let needReminder = [];
  for (const user of hadirList) {
    const { hasBefore, hasAfter, isComplete } = await getUserQCStatus(outletId, user.telegram_id, today);
    const name = user.users?.full_name || `User ${user.telegram_id}`;
    if (type === 'before' && !hasBefore) needReminder.push(mentionUser(user.telegram_id, name));
    else if (type === 'progress' && !isComplete) needReminder.push(mentionUser(user.telegram_id, name));
    else if (type === 'after' && hasBefore && !hasAfter) needReminder.push(mentionUser(user.telegram_id, name));
    else if (type === 'warning' && !isComplete) needReminder.push(mentionUser(user.telegram_id, name));
  }
  if (needReminder.length === 0) return;

  let message = '';
  switch (type) {
    case 'before':
      message = `📸 *Reminder QC Before*\n\nJangan lupa kirim foto BEFORE dengan format:\nNama - Before - Treatment - HH:MM-HH:MM - Outlet\n\n${needReminder.join(', ')}`;
      break;
    case 'progress':
      message = `⏳ *Reminder Progress QC*\n\nBeberapa staff belum lengkap foto QC.\n\n${needReminder.join(', ')}`;
      break;
    case 'after':
      message = `✨ *Reminder QC After*\n\nWaktunya kirim foto AFTER! Pastikan sudah ada BEFORE.\n\n${needReminder.join(', ')}`;
      break;
    case 'warning':
      message = `⚠️ *WARNING AKHIR HARI*\n\nHari akan segera berakhir. Segera lengkapi foto QC atau isi /skip <alasan>\n\n${needReminder.join(', ')}`;
      break;
  }
  try { await bot.sendMessage(outletId, message, { parse_mode: 'Markdown' }); } catch (err) { console.error(`Reminder error: ${err.message}`); }
}

module.exports = { getOperationalOutlets, sendReminder };