const cron = require('node-cron');
const supabase = require('./db');
const { getToday, mentionUser } = require('./utils');
const { buildDashboardText } = require('./commands/dashboard');

/**
 * Kirim reminder QC ke user yang belum lengkap
 * Hanya dijalankan kalau outlet is_operational = true
 */
async function sendReminderToOutlet(bot, outletId, outletName) {
  const today = getToday();

  const { data: absenList } = await supabase
    .from('absen')
    .select('telegram_id, status, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', today);

  if (!absenList || absenList.length === 0) return;

  const { data: qcList } = await supabase
    .from('qc_logs')
    .select('telegram_id, type')
    .eq('outlet_id', outletId)
    .eq('date', today);

  // Map QC per user
  const qcMap = {};
  qcList?.forEach(q => {
    if (!qcMap[q.telegram_id]) qcMap[q.telegram_id] = { before: false, after: false };
    qcMap[q.telegram_id][q.type] = true;
  });

  // Filter yang hadir tapi belum lengkap QC
  const belum = absenList.filter(a => {
    if (a.status !== 'h') return false;
    const qc = qcMap[a.telegram_id];
    return !qc || !qc.before || !qc.after;
  });

  if (belum.length === 0) return;

  let text = `🚨 *REMINDER QC*\n\n`;
  text += `Belum lengkap foto QC:\n`;

  belum.forEach(u => {
    const qc = qcMap[u.telegram_id] || {};
    const kurang = [];
    if (!qc.before) kurang.push('Before');
    if (!qc.after) kurang.push('After');
    const name = u.users?.full_name || `User ${u.telegram_id}`;
    text += `• ${mentionUser(u.telegram_id, name)} — ${kurang.join(', ')}\n`;
  });

  try {
    await bot.sendMessage(outletId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`[CRON] Gagal kirim reminder ke outlet ${outletId}:`, err.message);
  }
}


/**
 * Ambil semua outlet yang operasional hari ini
 */
async function getOperationalOutlets() {
  const { data } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_operational', true);
  return data || [];
}


/**
 * Reset is_operational semua outlet setiap tengah malam WIB
 * Biar manager harus set /libur ulang setiap hari kalau memang libur
 */
async function resetOperationalStatus() {
  await supabase
    .from('outlets')
    .update({ is_operational: true })
    .eq('is_active', true);
  console.log('[CRON] is_operational direset ke true untuk semua outlet');
}


function registerCron(bot) {
  // 10:00 WIB — Reminder absen pagi
  cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] 10:00 WIB — Reminder absen pagi');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      try {
        await bot.sendMessage(outlet.id,
          `📋 Selamat pagi! Jangan lupa absen hari ini.\n/absen`
        );
      } catch (err) {
        console.error(`[CRON] Gagal kirim ke ${outlet.id}:`, err.message);
      }
    }
  }, { timezone: 'Asia/Jakarta' });


  // 11:00 WIB — Reminder QC pertama
  cron.schedule('0 4 * * *', async () => {
    console.log('[CRON] 11:00 WIB — Reminder QC pertama');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);
    }
  }, { timezone: 'Asia/Jakarta' });


  // 14:00 WIB — Reminder QC siang
  cron.schedule('0 7 * * *', async () => {
    console.log('[CRON] 14:00 WIB — Reminder QC siang');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);
    }
  }, { timezone: 'Asia/Jakarta' });


  // 17:00 WIB — Reminder QC sore + auto dashboard
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] 17:00 WIB — Reminder QC sore + dashboard');
    const outlets = await getOperationalOutlets();
    const today = getToday();

    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);

      // Kirim dashboard harian otomatis
      try {
        const text = await buildDashboardText(outlet.id, outlet.name, today);
        await bot.sendMessage(outlet.id, `📊 *Recap Akhir Hari*\n\n${text}`, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`[CRON] Gagal kirim dashboard ${outlet.id}:`, err.message);
      }
    }
  }, { timezone: 'Asia/Jakarta' });


  // 00:01 WIB — Reset is_operational semua outlet
  cron.schedule('1 0 * * *', async () => {
    await resetOperationalStatus();
  }, { timezone: 'Asia/Jakarta' });


  console.log('⏰ Cron jobs terdaftar (timezone: Asia/Jakarta)');
}

module.exports = { registerCron };