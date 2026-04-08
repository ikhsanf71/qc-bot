const supabase = require('../db');
const { getToday, escapeMarkdown, dbQuery } = require('../utils');
const { isOwner, isManagerOrOwner, auditLog } = require('../middleware');

/**
 * /reset
 * Hapus data absen & QC hari ini untuk outlet ini
 * Hanya owner yang bisa (manager tidak boleh)
 */
async function handleReset(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const today = getToday();

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa reset data.');
  }

  // Validasi outlet
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[RESET] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!outlet) {
    return bot.sendMessage(chatId, '❌ Outlet ini belum terdaftar.');
  }

  // Hitung berapa data yang akan dihapus
  const { count: absenCount, error: absenCountError } = await supabase
    .from('absen')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', chatId)
    .eq('date', today);

  if (absenCountError) {
    console.error('[RESET] Error count absen:', absenCountError.message);
  }

  const { count: qcCount, error: qcCountError } = await supabase
    .from('qc_logs')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', chatId)
    .eq('date', today);

  if (qcCountError) {
    console.error('[RESET] Error count qc:', qcCountError.message);
  }

  // Konfirmasi dulu sebelum delete
  await bot.sendMessage(chatId,
    `⚠️ *Konfirmasi Reset*\n\n` +
    `Outlet: *${escapeMarkdown(outlet.name)}*\n` +
    `Tanggal: ${today}\n` +
    `Data yang akan dihapus:\n` +
    `• Absen: ${absenCount || 0} record\n` +
    `• QC Logs: ${qcCount || 0} record\n\n` +
    `Ketik /resetconfirm untuk lanjutkan.`,
    { parse_mode: 'Markdown' }
  );
}

async function handleResetConfirm(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const today = getToday();

  if (!isOwner(userId)) return;

  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[RESETCONFIRM] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error.');
  }

  if (!outlet) return;

  const { count: absenCount } = await supabase
    .from('absen')
    .select('*', { count: 'exact', head: true })
    .eq('outlet_id', chatId)
    .eq('date', today);

  // Delete absen
  const { error: deleteAbsenError } = await supabase
    .from('absen')
    .delete()
    .eq('outlet_id', chatId)
    .eq('date', today);

  if (deleteAbsenError) {
    console.error('[RESETCONFIRM] Error delete absen:', deleteAbsenError.message);
  }

  // Delete qc_logs
  const { error: deleteQcError } = await supabase
    .from('qc_logs')
    .delete()
    .eq('outlet_id', chatId)
    .eq('date', today);

  if (deleteQcError) {
    console.error('[RESETCONFIRM] Error delete qc:', deleteQcError.message);
  }

  await auditLog({
    actor: userId,
    action: 'absen_reset',
    outletId: chatId,
    metadata: { date: today, rows_deleted: absenCount || 0 }
  });

  bot.sendMessage(chatId,
    `🧹 Data *${escapeMarkdown(outlet.name)}* tanggal ${today} berhasil direset.`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * /libur
 * Set outlet tidak operasional hari ini → cron tidak kirim reminder
 * Manager atau owner bisa pakai ini
 */
async function handleLibur(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const canDo = isOwner(userId) || await isManagerOrOwner(userId, chatId);
  if (!canDo) {
    return bot.sendMessage(chatId, '⛔ Hanya manager atau owner yang bisa set libur.');
  }

  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name, is_operational')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[LIBUR] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error.');
  }

  if (!outlet) {
    return bot.sendMessage(chatId, '❌ Outlet ini belum terdaftar.');
  }

  if (!outlet.is_operational) {
    return bot.sendMessage(chatId, 'ℹ️ Outlet ini sudah dalam status libur hari ini.');
  }

  const { error: updateError } = await supabase
    .from('outlets')
    .update({ is_operational: false })
    .eq('id', chatId);

  if (updateError) {
    console.error('[LIBUR] Error update:', updateError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal mengubah status.');
  }

  await auditLog({
    actor: userId,
    action: 'outlet_libur',
    outletId: chatId,
    metadata: { date: getToday() }
  });

  bot.sendMessage(chatId,
    `🏖️ *${escapeMarkdown(outlet.name)}* di-set *LIBUR* hari ini.\n` +
    `Reminder otomatis tidak akan dikirim.\n\n` +
    `Untuk kembali operasional: /operational`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * /operational
 * Set outlet kembali operasional
 */
async function handleOperational(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const canDo = isOwner(userId) || await isManagerOrOwner(userId, chatId);
  if (!canDo) {
    return bot.sendMessage(chatId, '⛔ Hanya manager atau owner yang bisa ubah status operasional.');
  }

  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name, is_operational')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[OPERATIONAL] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error.');
  }

  if (!outlet) return;

  if (outlet.is_operational) {
    return bot.sendMessage(chatId, 'ℹ️ Outlet ini sudah dalam status operasional.');
  }

  const { error: updateError } = await supabase
    .from('outlets')
    .update({ is_operational: true })
    .eq('id', chatId);

  if (updateError) {
    console.error('[OPERATIONAL] Error update:', updateError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal mengubah status.');
  }

  await auditLog({
    actor: userId,
    action: 'outlet_operational',
    outletId: chatId,
    metadata: { date: getToday() }
  });

  bot.sendMessage(chatId,
    `✅ *${escapeMarkdown(outlet.name)}* kembali *OPERASIONAL*!`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * /outlets
 * Owner: lihat semua outlet + status
 * Hanya di private chat
 */
async function handleOutlets(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa akses daftar semua outlet.');
  }

  const { data: outlets, error: outletsError } = await supabase
    .from('outlets')
    .select('id, name, is_active, is_operational')
    .order('name');

  if (outletsError) {
    console.error('[OUTLETS] Error ambil outlets:', outletsError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error.');
  }

  if (!outlets || outlets.length === 0) {
    return bot.sendMessage(chatId, 'ℹ️ Belum ada outlet terdaftar.');
  }

  // Hitung jumlah member per outlet
  const { data: memberCounts, error: memberError } = await supabase
    .from('outlet_members')
    .select('outlet_id')
    .eq('is_active', true);

  if (memberError) {
    console.error('[OUTLETS] Error hitung member:', memberError.message);
  }

  const countMap = {};
  memberCounts?.forEach(m => {
    countMap[m.outlet_id] = (countMap[m.outlet_id] || 0) + 1;
  });

  let text = `🏪 *DAFTAR OUTLET* (${outlets.length})\n\n`;

  outlets.forEach((o, i) => {
    const status = !o.is_active ? '🔴 Nonaktif' : o.is_operational ? '🟢 Operasional' : '🟡 Libur';
    const members = countMap[o.id] || 0;
    text += `${i + 1}. *${escapeMarkdown(o.name)}*\n`;
    text += `   ${status} | 👥 ${members} anggota\n`;
    text += `   ID: \`${o.id}\`\n\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function register(bot) {
  bot.onText(/\/reset$/, (msg) => handleReset(bot, msg));
  bot.onText(/\/resetconfirm$/, (msg) => handleResetConfirm(bot, msg));
  bot.onText(/\/libur$/, (msg) => handleLibur(bot, msg));
  bot.onText(/\/operational$/, (msg) => handleOperational(bot, msg));
  bot.onText(/\/outlets$/, (msg) => handleOutlets(bot, msg));
}

module.exports = { register };