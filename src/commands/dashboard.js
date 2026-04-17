const supabase = require('../../db');
const { getToday, formatStatus, mentionUser, escapeMarkdown } = require('../../utils');
const { isOwner, isManagerOrOwner } = require('../middleware');
const { evaluateUserPerformance } = require('../services/evaluationEngine');
const { calculateOutletScore } = require('../services/outletPerformance');

/**
 * Build teks dashboard untuk satu outlet
 * Dilengkapi dengan:
 * - Status performa per user (PERFORM/NORMAL/WARNING)
 * - Score outlet (EXCELLENT/OK/PROBLEM)
 */
async function buildDashboardText(outletId, outletName, date) {
  try {
    const { data: absenList, error: absenError } = await supabase
      .from('absen')
      .select('telegram_id, status, created_at, users(full_name)')
      .eq('outlet_id', outletId)
      .eq('date', date);

    if (absenError) {
      console.error('[DASHBOARD] Error ambil absen:', absenError.message);
      return `📊 *${escapeMarkdown(outletName)}*\n_Gagal mengambil data._`;
    }

    const { data: qcList, error: qcError } = await supabase
      .from('qc_logs')
      .select('telegram_id, type, treatment, start_time, end_time')
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

    // Build map per user dengan data lengkap
    const map = {};
    absenList.forEach(a => {
      map[a.telegram_id] = {
        id: a.telegram_id,
        name: a.users?.full_name || `User ${a.telegram_id}`,
        status: a.status,
        jamAbsen: a.created_at,
        before: false,
        after: false,
        treatment: null,
        startTime: null,
        endTime: null
      };
    });

    qcList?.forEach(q => {
      if (map[q.telegram_id]) {
        map[q.telegram_id][q.type] = true;
        if (q.treatment) map[q.telegram_id].treatment = q.treatment;
        if (q.start_time) map[q.telegram_id].startTime = q.start_time;
        if (q.end_time) map[q.telegram_id].endTime = q.end_time;
      }
    });

    const users = Object.values(map);
    const hadir = users.filter(u => u.status === 'h');
    const tidakHadir = users.filter(u => u.status !== 'h');
    
    // Evaluasi performa setiap user yang hadir
    const hadirDenganPerforma = hadir.map(u => {
      const qcStatus = { hasBefore: u.before, hasAfter: u.after };
      const absenRecord = { status: u.status };
      const evaluation = evaluateUserPerformance(absenRecord, qcStatus);
      return { ...u, evaluation };
    });
    
    const lengkap = hadirDenganPerforma.filter(u => u.evaluation.status === 'PERFORM');
    const belumLengkap = hadirDenganPerforma.filter(u => u.evaluation.status !== 'PERFORM');
    
    // Hitung score outlet
    const totalHadir = hadir.length;
    const totalLengkap = lengkap.length;
    const { score, category } = calculateOutletScore(totalHadir, totalLengkap);
    
    // Format jam absen
    const formatJamAbsen = (timestamp) => {
      if (!timestamp) return '-';
      return new Date(timestamp).toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
      });
    };

    let text = `📊 *${escapeMarkdown(outletName)}* — ${date}\n`;
    text += `👥 Total: ${users.length} | ✅ Hadir: ${hadir.length}\n`;
    text += `📊 Score Outlet: *${score}* (${category})\n\n`;

    // Yang hadir LENGKAP (PERFORM)
    if (lengkap.length > 0) {
      text += `✅ *HADIR & LENGKAP (PERFORM)*\n`;
      lengkap.forEach(u => {
        text += `• ${escapeMarkdown(u.name)}`;
        if (u.treatment) text += ` — ${escapeMarkdown(u.treatment)}`;
        if (u.startTime && u.endTime) text += ` (${u.startTime}-${u.endTime})`;
        text += `\n`;
      });
      text += '\n';
    }

    // Yang hadir BELUM LENGKAP (NORMAL / WARNING)
    if (belumLengkap.length > 0) {
      text += `⚠️ *HADIR TAPI BELUM LENGKAP*\n`;
      belumLengkap.forEach(u => {
        const kurang = [];
        if (!u.before) kurang.push('Before');
        if (!u.after) kurang.push('After');
        const reason = skipMap[u.id] ? ` (skip: ${escapeMarkdown(skipMap[u.id].slice(0, 40))})` : '';
        const statusIcon = u.evaluation.status === 'NORMAL' ? '⚠️' : '❌';
        text += `${statusIcon} ${mentionUser(u.id, u.name)} — kurang: ${kurang.join(', ')}${reason}\n`;
      });
      text += '\n';
    }

    // Tidak hadir
    if (tidakHadir.length > 0) {
      text += `❌ *TIDAK HADIR*\n`;
      tidakHadir.forEach(u => {
        const jamAbsen = formatJamAbsen(u.jamAbsen);
        text += `• ${escapeMarkdown(u.name)} — ${formatStatus(u.status)} (absen: ${jamAbsen})\n`;
      });
      text += '\n';
    }

    // Ringkasan performa
    const performCount = lengkap.length;
    const normalCount = belumLengkap.filter(u => u.evaluation.status === 'NORMAL').length;
    const warningCount = belumLengkap.filter(u => u.evaluation.status === 'WARNING').length;
    
    if (hadir.length > 0) {
      text += `📈 *RINGKASAN PERFORMANCE*\n`;
      text += `   🟢 PERFORM (lengkap): ${performCount}\n`;
      text += `   🟡 NORMAL (sebagian): ${normalCount}\n`;
      text += `   🔴 WARNING (tidak ada): ${warningCount}\n`;
    }

    if (hadir.length > 0 && belumLengkap.length === 0) {
      text += `\n🎉 *SEMUA STAFF YANG HADIR LENGKAP QC-NYA!*\n`;
      text += `👍 Pertahankan disiplin ini!`;
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

  // Summary total dengan score rata-rata outlet
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

  // Hitung per outlet
  const outletStats = {};
  allAbsen?.forEach(a => {
    if (!outletStats[a.outlet_id]) outletStats[a.outlet_id] = { hadir: 0, total: 0 };
    outletStats[a.outlet_id].total++;
    if (a.status === 'h') outletStats[a.outlet_id].hadir++;
  });

  const qcByOutletUser = {};
  allQC?.forEach(q => {
    const key = `${q.outlet_id}:${q.telegram_id}`;
    if (!qcByOutletUser[key]) qcByOutletUser[key] = new Set();
    qcByOutletUser[key].add(q.type);
  });

  const lengkapByOutlet = {};
  Object.entries(qcByOutletUser).forEach(([key, types]) => {
    const outletId = parseInt(key.split(':')[0]);
    if (types.has('before') && types.has('after')) {
      lengkapByOutlet[outletId] = (lengkapByOutlet[outletId] || 0) + 1;
    }
  });

  // Hitung total score
  let totalScore = 0;
  let outletWithScore = 0;
  for (const [outletId, stats] of Object.entries(outletStats)) {
    const lengkap = lengkapByOutlet[outletId] || 0;
    if (stats.hadir > 0) {
      const score = (lengkap / stats.hadir) * 100;
      totalScore += score;
      outletWithScore++;
    }
  }
  const avgScore = outletWithScore > 0 ? Math.round(totalScore / outletWithScore) : 0;
  
  let avgCategory = 'PROBLEM';
  if (avgScore >= 85) avgCategory = 'EXCELLENT';
  else if (avgScore >= 70) avgCategory = 'OK';

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
    `📝 Skip (alasan): ${totalSkip}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *RATA-RATA SKOR OUTLET:* ${avgScore} (${avgCategory})`,
    { parse_mode: 'Markdown' }
  );
}

const { commandPattern } = require('../../utils');

function register(bot) {
  bot.onText(commandPattern('dashboard'), (msg) => handleDashboard(bot, msg));
  bot.onText(commandPattern('rekap'), (msg, match) => handleRekap(bot, msg, match));
}

module.exports = { register, buildDashboardText };