const supabase = require('../db');
const { getToday, formatStatus, mentionUser, escapeMarkdown } = require('../utils');
const { isOwner, isManagerOrOwner } = require('../middleware');

/**
 * Build teks dashboard untuk satu outlet
 */
async function buildDashboardText(outletId, outletName, date) {
  try {
    const { data: absenList, error: absenError } = await supabase
      .from('absen')
      .select('telegram_id, status, users(full_name)')
      .eq('outlet_id', outletId)
      .eq('date', date);

    if (absenError) {
      console.error('[DASHBOARD] Error ambil absen:', absenError.message);
      return `📊 *${escapeMarkdown(outletName)}*\n_Gagal mengambil data._`;
    }

    const { data: qcList, error: qcError } = await supabase
      .from('qc_logs')
      .select('telegram_id, type')
      .eq('outlet_id', outletId)
      .eq('date', date);

    if (qcError) {
      console.error('[DASHBOARD] Error ambil qc:', qcError.message);
    }

    // Ambil data skip untuk hari ini
    const { data: skipData, error: skipError } = await supabase
      .from('qc_skips')
      .select('telegram_id, reason')
      .eq('outlet_id', outletId)
      .eq('date', date);

    if (skipError) {
      console.error('[DASHBOARD] Error ambil skip:', skipError.message);
    }

    const skipMap = {};
    skipData?.forEach(s => {
      skipMap[s.telegram_id] = s.reason;
    });

    if (!absenList || absenList.length === 0) {
      return `📊 *${escapeMarkdown(outletName)}*\n_Belum ada yang absen hari ini._\n`;
    }

    // Build map per user
    const map = {};
    absenList.forEach(a => {
      map[a.telegram_id] = {
        id: a.telegram_id,
        name: a.users?.full_name || `User ${a.telegram_id}`,
        status: a.status,
        before: false,
        after: false
      };
    });

    qcList?.forEach(q => {
      if (map[q.telegram_id]) {
        map[q.telegram_id][q.type] = true;
      }
    });

    const users = Object.values(map);
    const hadir = users.filter(u => u.status === 'h');
    const tidakHadir = users.filter(u => u.status !== 'h');
    const belumLengkap = hadir.filter(u => !u.before || !u.after);
    const lengkap = hadir.filter(u => u.before && u.after);

    let text = `📊 *${escapeMarkdown(outletName)}* — ${date}\n`;
    text += `👥 Total: ${users.length} | ✅ Hadir: ${hadir.length}\n\n`;

    // Yang hadir LENGKAP (foto before & after)
    if (lengkap.length > 0) {
      text += `✅ *Hadir & Lengkap:*\n`;
      lengkap.forEach(u => {
        text += `• ${escapeMarkdown(u.name)}\n`;
      });
      text += '\n';
    }

    // Yang hadir BELUM LENGKAP (termasuk yang sudah skip)
    if (belumLengkap.length > 0) {
      text += `⚠️ *Hadir tapi Belum Lengkap / Skip:*\n`;
      belumLengkap.forEach(u => {
        const kurang = [];
        if (!u.before) kurang.push('Before');
        if (!u.after) kurang.push('After');
        const reason = skipMap[u.id] ? ` (skip: ${escapeMarkdown(skipMap[u.id].slice(0, 50))})` : '';
        text += `• ${mentionUser(u.id, u.name)} — kurang: ${kurang.join(', ')}${reason}\n`;
      });
      text += '\n';
    }

    // Tidak hadir
    if (tidakHadir.length > 0) {
      text += `❌ *Tidak Hadir:*\n`;
      tidakHadir.forEach(u => {
        text += `• ${escapeMarkdown(u.name)} — ${formatStatus(u.status)}\n`;
      });
      text += '\n';
    }

    if (hadir.length > 0 && belumLengkap.length === 0 && lengkap.length === hadir.length) {
      text += `🎉 Semua yang hadir sudah lengkap QC-nya!`;
    }

    return text;
  } catch (err) {
    console.error('[DASHBOARD] Error buildDashboardText:', err);
    return `📊 *${escapeMarkdown(outletName)}*\n⚠️ Terjadi error saat mengambil data.`;
  }
}

/**
 * /dashboard
 * Recap outlet hari ini (bisa dipakai manager & owner di grup)
 */
async function handleDashboard(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const today = getToday();

  // Validasi outlet
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[DASHBOARD] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!outlet) {
    return bot.sendMessage(chatId, '❌ Outlet ini belum terdaftar.');
  }

  // Hanya manager/owner yang bisa lihat dashboard
  const canView = isOwner(userId) || await isManagerOrOwner(userId, chatId);
  if (!canView) {
    return bot.sendMessage(chatId, '⛔ Hanya manager atau owner yang bisa lihat dashboard.');
  }

  const text = await buildDashboardText(outlet.id, outlet.name, today);
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

/**
 * /rekap [nama_outlet]
 * Owner: lihat semua outlet sekaligus, atau filter satu outlet
 * Hanya bisa di private chat biar tidak spam grup
 */
async function handleRekap(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const filterName = match[1]?.trim().toLowerCase();
  const today = getToday();

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa akses rekap semua outlet.');
  }

  // Ambil semua outlet aktif
  const { data: outlets, error: outletsError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('is_active', true);

  if (outletsError) {
    console.error('[REKAP] Error ambil outlets:', outletsError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error.');
  }

  if (!outlets || outlets.length === 0) {
    return bot.sendMessage(chatId, 'ℹ️ Belum ada outlet yang terdaftar.');
  }

  // Filter by nama kalau ada
  const filtered = filterName
    ? outlets.filter(o => o.name.toLowerCase().includes(filterName))
    : outlets;

  if (filtered.length === 0) {
    return bot.sendMessage(chatId, `❌ Outlet dengan nama "${filterName}" tidak ditemukan.`);
  }

  // Kalau banyak outlet, kirim loading dulu
  if (filtered.length > 5) {
    await bot.sendMessage(chatId, `⏳ Mengambil data ${filtered.length} outlet...`);
  }

  // Kirim per-batch 5 outlet agar tidak timeout
  const batchSize = 5;
  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);

    const texts = await Promise.all(
      batch.map(o => buildDashboardText(o.id, o.name, today))
    );

    const combined = texts.join('\n' + '─'.repeat(30) + '\n');
    await bot.sendMessage(chatId, combined, { parse_mode: 'Markdown' });
  }

  // Summary total
  const { data: allAbsen, error: absenError } = await supabase
    .from('absen')
    .select('status, outlet_id')
    .eq('date', today);

  if (absenError) {
    console.error('[REKAP] Error ambil allAbsen:', absenError.message);
  }

  const { data: allQC, error: qcError } = await supabase
    .from('qc_logs')
    .select('telegram_id, outlet_id, type')
    .eq('date', today);

  if (qcError) {
    console.error('[REKAP] Error ambil allQC:', qcError.message);
  }

  const totalHadir = allAbsen?.filter(a => a.status === 'h').length || 0;
  const outletAktif = new Set(allAbsen?.map(a => a.outlet_id)).size;

  // QC lengkap = user yang punya both before & after
  const qcByUser = {};
  allQC?.forEach(q => {
    const key = `${q.outlet_id}:${q.telegram_id}`;
    if (!qcByUser[key]) qcByUser[key] = new Set();
    qcByUser[key].add(q.type);
  });
  const qcLengkap = Object.values(qcByUser).filter(s => s.has('before') && s.has('after')).length;

  // Ambil total skip
  const { data: allSkip } = await supabase
    .from('qc_skips')
    .select('telegram_id')
    .eq('date', today);

  const totalSkip = allSkip?.length || 0;

  bot.sendMessage(chatId,
    `📈 *SUMMARY ${today}*\n\n` +
    `🏪 Outlet aktif: ${outletAktif}/${outlets.length}\n` +
    `👤 Total hadir: ${totalHadir}\n` +
    `✅ QC lengkap: ${qcLengkap}/${totalHadir || 0}\n` +
    `📝 Skip (alasan): ${totalSkip}`,
    { parse_mode: 'Markdown' }
  );
}

function register(bot) {
  bot.onText(/\/dashboard$/, (msg) => handleDashboard(bot, msg));
  bot.onText(/\/rekap ?(.*)/, (msg, match) => handleRekap(bot, msg, match));
}

module.exports = { register, buildDashboardText };