const supabase = require('../db');
const { isValidPhone, normalizePhone, escapeMarkdown, dbQuery } = require('../utils');
const { auditLog, isRateLimited, ROLES } = require('../middleware');

/**
 * /daftar Nama Lengkap | 08xxx
 *
 * Flow:
 * 1. Validasi format input
 * 2. Upsert data user (identitas global)
 * 3. Cek apakah outlet sudah terdaftar
 * 4. Cek keanggotaan user di outlet ini
 *    a. Belum punya outlet → langsung join
 *    b. Sudah di outlet yang sama → update data saja
 *    c. Sudah di outlet lain → buat transfer request, tunggu approval
 */
async function handleDaftar(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username?.toLowerCase() || '';

  // Rate limit: max 3x per menit
  if (isRateLimited(userId, 'daftar', 3)) {
    return bot.sendMessage(chatId, '⏳ Terlalu banyak request. Coba lagi dalam 1 menit.');
  }

  // Parse input
  const raw = match[1]?.trim();
  if (!raw || !raw.includes('|')) {
    return bot.sendMessage(chatId,
      '❌ Format tidak valid.\n\n' +
      'Gunakan: /daftar Nama Lengkap | 08xxx\n' +
      'Contoh: /daftar Budi Santoso | 08123456789'
    );
  }

  const [namePart, phonePart] = raw.split('|').map(s => s.trim());
  const fullName = namePart;
  const phone = normalizePhone(phonePart);

  if (!fullName || fullName.length < 2) {
    return bot.sendMessage(chatId, '❌ Nama terlalu pendek. Masukkan nama lengkap.');
  }

  if (!isValidPhone(phonePart)) {
    return bot.sendMessage(chatId,
      '❌ Nomor HP tidak valid.\n' +
      'Contoh yang benar: 08123456789 atau 628123456789'
    );
  }

  // Validasi outlet sudah terdaftar
  const { data: outlet, error: outletError } = await supabase
    .from('outlets')
    .select('id, name, is_active')
    .eq('id', chatId)
    .maybeSingle();

  if (outletError) {
    console.error('[DAFTAR] Error ambil outlet:', outletError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!outlet) {
    return bot.sendMessage(chatId,
      '❌ Outlet ini belum terdaftar.\n' +
      'Hubungi owner untuk jalankan /setup terlebih dahulu.'
    );
  }

  if (!outlet.is_active) {
    return bot.sendMessage(chatId, '❌ Outlet ini tidak aktif. Hubungi owner.');
  }

  // Upsert identitas global user
  const { error: upsertUserError } = await supabase
    .from('users')
    .upsert({
      telegram_id: userId,
      full_name: fullName,
      phone,
      username
    }, { onConflict: 'telegram_id' });

  if (upsertUserError) {
    console.error('[DAFTAR] Error upsert user:', upsertUserError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal menyimpan data user.');
  }

  // Cek keanggotaan aktif user saat ini
  const { data: currentMembership, error: membershipError } = await supabase
    .from('outlet_members')
    .select('outlet_id, role, outlets(name)')
    .eq('telegram_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError) {
    console.error('[DAFTAR] Error cek membership:', membershipError.message);
  }

  // Case A: belum punya outlet → langsung join
  if (!currentMembership) {
    const { error: insertError } = await supabase
      .from('outlet_members')
      .upsert({
        telegram_id: userId,
        outlet_id: chatId,
        role: ROLES.STAFF,
        is_active: true,
        joined_at: new Date().toISOString()
      }, { onConflict: 'telegram_id,outlet_id' });

    if (insertError) {
      console.error('[DAFTAR] Error insert membership:', insertError.message);
      return bot.sendMessage(chatId, '⚠️ Gagal mendaftarkan ke outlet.');
    }

    await auditLog({
      actor: userId,
      action: 'member_joined',
      outletId: chatId,
      target: userId,
      metadata: { full_name: fullName, phone }
    });

    return bot.sendMessage(chatId,
      `✅ Selamat datang, *${escapeMarkdown(fullName)}*!\n\n` +
      `📍 Outlet: *${escapeMarkdown(outlet.name)}*\n` +
      `📱 HP: ${phone}\n\n` +
      `Kamu sudah bisa absen dengan /absen`,
      { parse_mode: 'Markdown' }
    );
  }

  // Case B: sudah di outlet yang sama → update data saja
  if (currentMembership.outlet_id === chatId) {
    return bot.sendMessage(chatId,
      `✅ Data diperbarui, *${escapeMarkdown(fullName)}*!\n\n` +
      `📍 Outlet: *${escapeMarkdown(outlet.name)}*\n` +
      `📱 HP: ${phone}`,
      { parse_mode: 'Markdown' }
    );
  }

  // Case C: sudah di outlet lain → buat transfer request
  // Cek apakah sudah ada request pending (pakai maybeSingle biar tidak error kalau multiple rows)
  const { data: pendingTransfer, error: pendingError } = await supabase
    .from('transfer_requests')
    .select('id, to_outlet_id')
    .eq('telegram_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingError) {
    console.error('[DAFTAR] Error cek pending transfer:', pendingError.message);
  }

  if (pendingTransfer) {
    if (pendingTransfer.to_outlet_id === chatId) {
      return bot.sendMessage(chatId,
        `⏳ Permintaan pindah ke outlet ini sedang menunggu approval manager.\n` +
        `Sabar ya, *${escapeMarkdown(fullName)}* 😊`,
        { parse_mode: 'Markdown' }
      );
    } else {
      return bot.sendMessage(chatId,
        '❌ Kamu masih punya request pindah outlet yang pending.\n' +
        'Tunggu sampai diproses atau hubungi manager outlet sebelumnya.'
      );
    }
  }

  // Buat transfer request baru
  const { error: insertTransferError } = await supabase
    .from('transfer_requests')
    .insert({
      telegram_id: userId,
      from_outlet_id: currentMembership.outlet_id,
      to_outlet_id: chatId,
      status: 'pending'
    });

  if (insertTransferError) {
    console.error('[DAFTAR] Error insert transfer request:', insertTransferError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal membuat request pindah outlet.');
  }

  // Cari manager outlet tujuan untuk notif
  const { data: managers, error: managersError } = await supabase
    .from('outlet_members')
    .select('telegram_id')
    .eq('outlet_id', chatId)
    .eq('role', ROLES.MANAGER)
    .eq('is_active', true);

  if (managersError) {
    console.error('[DAFTAR] Error ambil managers:', managersError.message);
  }

  const fromName = currentMembership.outlets?.name || 'outlet lain';

  // Notif ke semua manager outlet tujuan
  if (managers?.length) {
    for (const m of managers) {
      try {
        await bot.sendMessage(m.telegram_id,
          `🔄 *Request Pindah Outlet*\n\n` +
          `👤 *${escapeMarkdown(fullName)}*\n` +
          `📱 HP: ${phone}\n` +
          `Dari: ${escapeMarkdown(fromName)}\n` +
          `Ke: *${escapeMarkdown(outlet.name)}*\n\n` +
          `Approve: /approve ${userId}\n` +
          `Reject: /rejecttransfer ${userId}`,
          { parse_mode: 'Markdown' }
        );
      } catch { /* manager tidak bisa di-DM */ }
    }
  }

  // Notif ke owner juga
  const { OWNER_IDS } = require('../middleware');
  for (const ownerId of OWNER_IDS) {
    try {
      await bot.sendMessage(ownerId,
        `🔄 *Request Pindah Outlet*\n\n` +
        `👤 *${escapeMarkdown(fullName)}* (${userId})\n` +
        `Dari: ${escapeMarkdown(fromName)}\n` +
        `Ke: *${escapeMarkdown(outlet.name)}*\n\n` +
        `Approve: /approve ${userId}\n` +
        `Reject: /rejecttransfer ${userId}`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* skip */ }
  }

  bot.sendMessage(chatId,
    `📨 Permintaan pindah outlet dikirim!\n\n` +
    `👤 ${escapeMarkdown(fullName)}\n` +
    `Dari: ${escapeMarkdown(fromName)}\n` +
    `Ke: *${escapeMarkdown(outlet.name)}*\n\n` +
    `Menunggu approval manager/owner. Kamu akan diberitahu hasilnya.`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * /approve <telegram_id>
 * Manager/owner approve request pindah outlet
 */
async function handleApprove(bot, msg, match) {
  const chatId = msg.chat.id;
  const actorId = msg.from.id;
  const targetId = parseInt(match[1]);

  if (isNaN(targetId)) {
    return bot.sendMessage(chatId, '❌ Format: /approve <telegram_id>');
  }

  const { isOwner, isManagerOrOwner } = require('../middleware');

  // Validasi role
  const canApprove = isOwner(actorId) || await isManagerOrOwner(actorId, chatId);
  if (!canApprove) {
    return bot.sendMessage(chatId, '⛔ Hanya manager atau owner yang bisa approve.');
  }

  // Cari pending request
  const { data: request, error: requestError } = await supabase
    .from('transfer_requests')
    .select('*, users(full_name, phone)')
    .eq('telegram_id', targetId)
    .eq('to_outlet_id', chatId)
    .eq('status', 'pending')
    .maybeSingle();

  if (requestError) {
    console.error('[APPROVE] Error ambil request:', requestError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!request) {
    return bot.sendMessage(chatId, '❌ Tidak ada request pending dari user ini.');
  }

  // Update request → approved
  const { error: updateError } = await supabase
    .from('transfer_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: actorId })
    .eq('id', request.id);

  if (updateError) {
    console.error('[APPROVE] Error update request:', updateError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal approve request.');
  }

  // Nonaktifkan keanggotaan outlet lama
  if (request.from_outlet_id) {
    await supabase
      .from('outlet_members')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('telegram_id', targetId)
      .eq('outlet_id', request.from_outlet_id);
  }

  // Aktifkan/buat keanggotaan outlet baru
  await supabase
    .from('outlet_members')
    .upsert({
      telegram_id: targetId,
      outlet_id: chatId,
      role: ROLES.STAFF,
      is_active: true,
      joined_at: new Date().toISOString(),
      left_at: null
    }, { onConflict: 'telegram_id,outlet_id' });

  await auditLog({
    actor: actorId,
    action: 'member_transfer_approved',
    outletId: chatId,
    target: targetId
  });

  // Notif ke user
  const userName = request.users?.full_name || `User ${targetId}`;
  const { data: outlet } = await supabase
    .from('outlets')
    .select('name')
    .eq('id', chatId)
    .maybeSingle();

  try {
    await bot.sendMessage(targetId,
      `✅ Request pindah outlet disetujui!\n\n` +
      `Kamu sekarang terdaftar di *${escapeMarkdown(outlet?.name || '')}*\n` +
      `Silakan absen dengan /absen di grup outlet baru.`,
      { parse_mode: 'Markdown' }
    );
  } catch { /* user tidak bisa di-DM */ }

  bot.sendMessage(chatId,
    `✅ *${escapeMarkdown(userName)}* berhasil dipindahkan ke outlet ini.`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * /rejecttransfer <telegram_id>
 * Manager/owner reject request pindah outlet
 */
async function handleRejectTransfer(bot, msg, match) {
  const chatId = msg.chat.id;
  const actorId = msg.from.id;
  const targetId = parseInt(match[1]);

  if (isNaN(targetId)) {
    return bot.sendMessage(chatId, '❌ Format: /rejecttransfer <telegram_id>');
  }

  const { isOwner, isManagerOrOwner } = require('../middleware');
  const canReject = isOwner(actorId) || await isManagerOrOwner(actorId, chatId);
  if (!canReject) {
    return bot.sendMessage(chatId, '⛔ Hanya manager atau owner yang bisa reject.');
  }

  const { data: request, error: requestError } = await supabase
    .from('transfer_requests')
    .select('*, users(full_name)')
    .eq('telegram_id', targetId)
    .eq('to_outlet_id', chatId)
    .eq('status', 'pending')
    .maybeSingle();

  if (requestError) {
    console.error('[REJECT] Error ambil request:', requestError.message);
    return bot.sendMessage(chatId, '⚠️ Terjadi error, coba lagi.');
  }

  if (!request) {
    return bot.sendMessage(chatId, '❌ Tidak ada request pending dari user ini.');
  }

  const { error: updateError } = await supabase
    .from('transfer_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: actorId })
    .eq('id', request.id);

  if (updateError) {
    console.error('[REJECT] Error update request:', updateError.message);
    return bot.sendMessage(chatId, '⚠️ Gagal reject request.');
  }

  await auditLog({
    actor: actorId,
    action: 'member_transfer_rejected',
    outletId: chatId,
    target: targetId
  });

  const userName = request.users?.full_name || `User ${targetId}`;

  try {
    await bot.sendMessage(targetId,
      '❌ Request pindah outlet ditolak.\n' +
      'Hubungi manager untuk informasi lebih lanjut.'
    );
  } catch { /* skip */ }

  bot.sendMessage(chatId, `❌ Request dari *${escapeMarkdown(userName)}* ditolak.`, { parse_mode: 'Markdown' });
}

function register(bot) {
  bot.onText(/\/daftar (.+)/, (msg, match) => handleDaftar(bot, msg, match));
  bot.onText(/\/approve (\d+)/, (msg, match) => handleApprove(bot, msg, match));
  bot.onText(/\/rejecttransfer (\d+)/, (msg, match) => handleRejectTransfer(bot, msg, match));
}

module.exports = { register };