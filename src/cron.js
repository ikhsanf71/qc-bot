const cron = require('node-cron');
const supabase = require('../db');
const { getToday, mentionUser, escapeMarkdown } = require('../utils');
const { buildDashboardText } = require('./commands/dashboard');

/**
 * Kirim reminder QC ke user yang belum lengkap
 * Hanya dijalankan kalau outlet is_operational = true
 */
async function sendReminderToOutlet(bot, outletId, outletName) {
  const today = getToday();

  const { data: absenList, error: absenError } = await supabase
    .from('absen')
    .select('telegram_id, status, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', today);

  if (absenError) {
    console.error(`[CRON] Gagal ambil absen outlet ${outletId}:`, absenError.message);
    return;
  }

  if (!absenList || absenList.length === 0) return;

  const { data: qcList, error: qcError } = await supabase
    .from('qc_logs')
    .select('telegram_id, type')
    .eq('outlet_id', outletId)
    .eq('date', today);

  if (qcError) {
    console.error(`[CRON] Gagal ambil qc outlet ${outletId}:`, qcError.message);
    return;
  }

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

  for (const u of belum) {
    const qc = qcMap[u.telegram_id] || {};
    const kurang = [];
    if (!qc.before) kurang.push('Before');
    if (!qc.after) kurang.push('After');
    const name = u.users?.full_name || `User ${u.telegram_id}`;
    text += `• ${mentionUser(u.telegram_id, name)} — ${kurang.join(', ')}\n`;
  }

  try {
    await bot.sendMessage(outletId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`[CRON] Gagal kirim reminder ke outlet ${outletId}:`, err.message);
  }
}

/**
 * Kirim reminder skip untuk staff yang hadir, belum foto, belum skip
 * Dijalankan jam 21:00 WIB
 */
async function sendSkipReminder(bot, outletId, outletName) {
  const today = getToday();

  // Ambil staff yang hadir (status 'h')
  const { data: hadirList, error: absenError } = await supabase
    .from('absen')
    .select('telegram_id, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', today)
    .eq('status', 'h');

  if (absenError) {
    console.error(`[CRON] Gagal ambil hadir outlet ${outletId}:`, absenError.message);
    return;
  }

  if (!hadirList || hadirList.length === 0) return;

  // Ambil staff yang sudah kirim foto (before/after)
  const { data: qcList } = await supabase
    .from('qc_logs')
    .select('telegram_id')
    .eq('outlet_id', outletId)
    .eq('date', today);

  const sudahFoto = new Set(qcList?.map(q => q.telegram_id) || []);

  // Ambil staff yang sudah skip
  const { data: skipList } = await supabase
    .from('qc_skips')
    .select('telegram_id')
    .eq('outlet_id', outletId)
    .eq('date', today);

  const sudahSkip = new Set(skipList?.map(s => s.telegram_id) || []);

  // Filter: hadir, belum foto, belum skip
  const perluReminder = hadirList.filter(h => 
    !sudahFoto.has(h.telegram_id) && !sudahSkip.has(h.telegram_id)
  );

  if (perluReminder.length === 0) return;

  let text = `🌙 *Reminder Akhir Hari*\n\n`;
  text += `Beberapa staff belum mengirim foto QC dan belum memberikan alasan skip.\n\n`;
  text += `*Wajib isi alasan dengan:*\n`;
  text += `/skip Alasan kamu tidak kirim foto\n\n`;
  text += `*Belum mengisi:*\n`;

  for (const u of perluReminder) {
    const name = u.users?.full_name || `User ${u.telegram_id}`;
    text += `• ${mentionUser(u.telegram_id, name)}\n`;
  }

  try {
    await bot.sendMessage(outletId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`[CRON] Gagal kirim skip reminder ke ${outletId}:`, err.message);
  }
}

/**
 * Ambil semua outlet yang operasional hari ini
 */
async function getOperationalOutlets() {
  const { data, error } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true)
    .eq('is_operational', true);

  if (error) {
    console.error('[CRON] Gagal ambil outlet operasional:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Reset is_operasional semua outlet setiap tengah malam WIB
 * Schedule: 17:01 UTC = 00:01 WIB
 */
async function resetOperationalStatus() {
  const { error } = await supabase
    .from('outlets')
    .update({ is_operational: true })
    .eq('is_active', true);

  if (error) {
    console.error('[CRON] Gagal reset is_operational:', error.message);
  } else {
    console.log('[CRON] is_operational direset ke true untuk semua outlet');
  }
}

function registerCron(bot) {
  // 10:00 WIB — Reminder absen pagi (03:00 UTC)
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

  // 11:00 WIB — Reminder QC pertama (04:00 UTC)
  cron.schedule('0 4 * * *', async () => {
    console.log('[CRON] 11:00 WIB — Reminder QC pertama');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);
    }
  }, { timezone: 'Asia/Jakarta' });

  // 14:00 WIB — Reminder QC siang (07:00 UTC)
  cron.schedule('0 7 * * *', async () => {
    console.log('[CRON] 14:00 WIB — Reminder QC siang');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);
    }
  }, { timezone: 'Asia/Jakarta' });

  // 17:00 WIB — Reminder QC sore + auto dashboard (10:00 UTC)
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] 17:00 WIB — Reminder QC sore + dashboard');
    const outlets = await getOperationalOutlets();
    const today = getToday();

    for (const outlet of outlets) {
      await sendReminderToOutlet(bot, outlet.id, outlet.name);

      // Kirim dashboard harian otomatis (tanpa header tambahan)
      try {
        const text = await buildDashboardText(outlet.id, outlet.name, today);
        await bot.sendMessage(outlet.id, text, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`[CRON] Gagal kirim dashboard ${outlet.id}:`, err.message);
      }
    }
  }, { timezone: 'Asia/Jakarta' });

  // 21:00 WIB — Reminder skip untuk yang belum foto (14:00 UTC)
  cron.schedule('0 14 * * *', async () => {
    console.log('[CRON] 21:00 WIB — Reminder skip QC');
    const outlets = await getOperationalOutlets();
    for (const outlet of outlets) {
      await sendSkipReminder(bot, outlet.id, outlet.name);
    }
  }, { timezone: 'Asia/Jakarta' });

  // 00:01 WIB — Reset is_operational semua outlet (17:01 UTC)
  cron.schedule('1 17 * * *', async () => {
    console.log('[CRON] 00:01 WIB — Reset is_operational semua outlet');
    await resetOperationalStatus();
  }, { timezone: 'Asia/Jakarta' });

  console.log('⏰ Cron jobs terdaftar (timezone: Asia/Jakarta)');
}

module.exports = { registerCron };