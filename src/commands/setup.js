const supabase = require('../db');
const { auditLog, isOwner, isManagerOrOwner, ROLES } = require('../middleware');
const { dbQuery, escapeMarkdown } = require('../utils');

/**
 * /setup NamaOutlet
 * Hanya owner yang bisa jalankan ini di grup baru
 * Otomatis register chat_id sebagai outlet baru
 */
async function handleSetup(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = match[1]?.trim();

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa setup outlet.');
  }

  if (!name) {
    return bot.sendMessage(chatId, '❌ Format: /setup NamaOutlet\nContoh: /setup Outlet Yogyakarta');
  }

  if (msg.chat.type === 'private') {
    return bot.sendMessage(chatId, '❌ Command ini hanya bisa dijalankan di grup.');
  }

  // Cek apakah sudah terdaftar
  const existing = await supabase
    .from('outlets')
    .select('id, name')
    .eq('id', chatId)
    .single();

  if (existing.data) {
    return bot.sendMessage(chatId,
      `ℹ️ Outlet ini sudah terdaftar sebagai *${escapeMarkdown(existing.data.name)}*\n` +
      `Gunakan /addmanager @username untuk assign manager.`,
      { parse_mode: 'Markdown' }
    );
  }

  await dbQuery(() =>
    supabase.from('outlets').insert({
      id: chatId,
      name,
      is_active: true,
      is_operational: true
    })
  );

  await auditLog({
    actor: userId,
    action: 'outlet_setup',
    outletId: chatId,
    metadata: { name }
  });

  bot.sendMessage(chatId,
    `✅ *${escapeMarkdown(name)}* berhasil didaftarkan!\n\n` +
    `Langkah selanjutnya:\n` +
    `1️⃣ Assign manager: /addmanager @username\n` +
    `2️⃣ Staff daftar: /daftar Nama Lengkap | 08xxx`,
    { parse_mode: 'Markdown' }
  );
}


/**
 * /addmanager @username
 * Owner assign manager ke outlet ini
 * Manager akan di-DM untuk konfirmasi /accept
 */
async function handleAddManager(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const usernameRaw = match[1]?.trim();

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa assign manager.');
  }

  // Validasi outlet sudah setup
  const { data: outlet } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('id', chatId)
    .single();

  if (!outlet) {
    return bot.sendMessage(chatId, '❌ Outlet belum di-setup. Jalankan /setup NamaOutlet dulu.');
  }

  if (!usernameRaw) {
    return bot.sendMessage(chatId, '❌ Format: /addmanager @username');
  }

  const username = usernameRaw.replace('@', '').toLowerCase();

  // Cek apakah sudah ada invite pending untuk outlet ini
  const { data: existingInvite } = await supabase
    .from('manager_invites')
    .select('id')
    .eq('outlet_id', chatId)
    .eq('username', username)
    .eq('status', 'pending')
    .single();

  if (existingInvite) {
    return bot.sendMessage(chatId,
      `ℹ️ @${username} sudah punya invite pending untuk outlet ini.\n` +
      `Minta mereka ketik /accept di chat pribadi dengan bot.`
    );
  }

  // Cek apakah user sudah terdaftar di sistem (pernah /daftar)
  const { data: user } = await supabase
    .from('users')
    .select('telegram_id, full_name')
    .eq('username', username)
    .single();

  // Buat invite
  await dbQuery(() =>
    supabase.from('manager_invites').insert({
      telegram_id: user?.telegram_id || null,
      username,
      outlet_id: chatId,
      invited_by: userId,
      status: 'pending'
    })
  );

  // Kalau sudah terdaftar & kita tahu telegram_id-nya → langsung DM
  if (user?.telegram_id) {
    try {
      await bot.sendMessage(user.telegram_id,
        `👋 Halo *${escapeMarkdown(user.full_name)}*!\n\n` +
        `Kamu ditunjuk sebagai *Manager* di outlet:\n` +
        `📍 *${escapeMarkdown(outlet.name)}*\n\n` +
        `Ketik /accept untuk konfirmasi, atau /reject untuk menolak.\n` +
        `_(Invite berlaku 48 jam)_`,
        { parse_mode: 'Markdown' }
      );

      bot.sendMessage(chatId,
        `✅ Invite dikirim ke @${username}.\n` +
        `Menunggu konfirmasi dari mereka.`
      );
    } catch {
      // Gagal DM (user belum start bot)
      bot.sendMessage(chatId,
        `✅ Invite dibuat untuk @${username}.\n` +
        `⚠️ Gagal kirim DM — minta @${username} untuk start bot dulu, lalu ketik /accept.`
      );
    }
  } else {
    // Belum pernah /daftar — harus start bot dulu
    bot.sendMessage(chatId,
      `✅ Invite dibuat untuk @${username}.\n` +
      `⚠️ @${username} belum terdaftar di sistem.\n` +
      `Minta mereka:\n` +
      `1. Start bot ini di chat pribadi\n` +
      `2. Daftar: /daftar Nama Lengkap | 08xxx\n` +
      `3. Ketik /accept`
    );
  }
}


/**
 * /accept
 * Manager konfirmasi invite di chat pribadi dengan bot
 */
async function handleAccept(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (msg.chat.type !== 'private') {
    return bot.sendMessage(chatId, '❌ /accept hanya bisa di chat pribadi dengan bot.');
  }

  // Cari invite pending berdasarkan telegram_id atau username
  const username = msg.from.username?.toLowerCase();

  const { data: invite } = await supabase
    .from('manager_invites')
    .select('*, outlets(name)')
    .or(`telegram_id.eq.${userId},username.eq.${username}`)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite) {
    return bot.sendMessage(chatId,
      '❌ Tidak ada invite aktif untukmu.\n' +
      'Minta owner untuk jalankan /addmanager @username-mu di grup outlet.'
    );
  }

  // Pastikan user sudah /daftar
  const { data: user } = await supabase
    .from('users')
    .select('telegram_id, full_name')
    .eq('telegram_id', userId)
    .single();

  if (!user) {
    return bot.sendMessage(chatId,
      '❌ Kamu belum terdaftar.\n' +
      'Daftar dulu: /daftar Nama Lengkap | 08xxx\n' +
      'Lalu ketik /accept lagi.'
    );
  }

  // Update invite → accepted
  await dbQuery(() =>
    supabase
      .from('manager_invites')
      .update({ status: 'accepted', telegram_id: userId })
      .eq('id', invite.id)
  );

  // Upsert outlet_members dengan role manager
  await dbQuery(() =>
    supabase.from('outlet_members').upsert({
      telegram_id: userId,
      outlet_id: invite.outlet_id,
      role: ROLES.MANAGER,
      is_active: true,
      joined_at: new Date().toISOString(),
      left_at: null
    }, { onConflict: 'telegram_id,outlet_id' })
  );

  await auditLog({
    actor: userId,
    action: 'manager_assigned',
    outletId: invite.outlet_id,
    target: userId,
    metadata: { username }
  });

  bot.sendMessage(chatId,
    `🎉 Selamat *${escapeMarkdown(user.full_name)}*!\n\n` +
    `Kamu sekarang adalah *Manager* di:\n` +
    `📍 *${escapeMarkdown(invite.outlets.name)}*\n\n` +
    `Command yang tersedia:\n` +
    `• /dashboard — lihat status QC hari ini\n` +
    `• /libur — set outlet libur hari ini\n` +
    `• Approve transfer staff via notifikasi`,
    { parse_mode: 'Markdown' }
  );
}


/**
 * /reject
 * Manager tolak invite
 */
async function handleReject(bot, msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const username = msg.from.username?.toLowerCase();

  if (msg.chat.type !== 'private') {
    return bot.sendMessage(chatId, '❌ /reject hanya bisa di chat pribadi dengan bot.');
  }

  const { data: invite } = await supabase
    .from('manager_invites')
    .select('id, outlet_id, invited_by, outlets(name)')
    .or(`telegram_id.eq.${userId},username.eq.${username}`)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invite) {
    return bot.sendMessage(chatId, '❌ Tidak ada invite aktif untukmu.');
  }

  await dbQuery(() =>
    supabase
      .from('manager_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id)
  );

  // Notif ke owner
  try {
    await bot.sendMessage(invite.invited_by,
      `ℹ️ @${username || userId} menolak invite Manager untuk outlet *${escapeMarkdown(invite.outlets.name)}*.`,
      { parse_mode: 'Markdown' }
    );
  } catch { /* owner tidak bisa di-DM, skip */ }

  bot.sendMessage(chatId, '✅ Invite ditolak. Owner akan diberitahu.');
}


function register(bot) {
  bot.onText(/\/setup (.+)/, (msg, match) => handleSetup(bot, msg, match));
  bot.onText(/\/addmanager (@\S+)/, (msg, match) => handleAddManager(bot, msg, match));
  bot.onText(/\/accept$/, (msg) => handleAccept(bot, msg));
  bot.onText(/\/reject$/, (msg) => handleReject(bot, msg));
}

module.exports = { register };