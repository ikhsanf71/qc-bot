const supabase = require('../db');
const { getToday, formatStatus, escapeMarkdown, dbQuery } = require('../utils');
const { isRateLimited, isActiveMember } = require('../middleware');

const VALID_STATUS = ['h', 'i', 's', 'l'];

/**
 * /absen
 * Tampilkan tombol pilihan status kehadiran
 */
async function handleAbsen(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isRateLimited(userId, 'absen', 3)) {
    return bot.sendMessage(chatId, '⏳ Terlalu banyak request. Coba lagi sebentar.');
  }

  // Validasi outlet terdaftar
  const { data: outlet } = await supabase
    .from('outlets')
    .select('id, is_active, is_operational')
    .eq('id', chatId)
    .single();

  if (!outlet || !outlet.is_active) {
    return bot.sendMessage(chatId, '❌ Outlet ini belum terdaftar atau tidak aktif.');
  }

  // Validasi user terdaftar & aktif di outlet ini
  const { data: user } = await supabase
    .from('users')
    .select('full_name')
    .eq('telegram_id', userId)
    .single();

  if (!user) {
    return bot.sendMessage(chatId,
      '❌ Kamu belum terdaftar.\n' +
      'Daftar dulu: /daftar Nama Lengkap | 08xxx'
    );
  }

  const isMember = await isActiveMember(userId, chatId);
  if (!isMember) {
    return bot.sendMessage(chatId,
      '❌ Kamu bukan anggota aktif outlet ini.\n' +
      'Daftar ulang: /daftar Nama Lengkap | 08xxx'
    );
  }

  // Cek apakah sudah absen hari ini
  const today = getToday();
  const { data: existingAbsen } = await supabase
    .from('absen')
    .select('status')
    .eq('outlet_id', chatId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .single();

  if (existingAbsen) {
    return bot.sendMessage(chatId,
      `ℹ️ Kamu sudah absen hari ini: *${formatStatus(existingAbsen.status)}*\n\n` +
      `Mau ubah? Hubungi manager.`,
      { parse_mode: 'Markdown' }
    );
  }

  bot.sendMessage(chatId,
    `📋 Pilih status kehadiranmu hari ini, *${escapeMarkdown(user.full_name)}*:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Hadir', callback_data: `absen:h:${chatId}` },
            { text: '🟡 Izin', callback_data: `absen:i:${chatId}` }
          ],
          [
            { text: '🤒 Sakit', callback_data: `absen:s:${chatId}` },
            { text: '💤 Libur', callback_data: `absen:l:${chatId}` }
          ]
        ]
      }
    }
  );
}


/**
 * Callback handler untuk tombol absen
 * Format callback_data: "absen:<status>:<outletId>"
 */
async function handleAbsenCallback(bot, q) {
  const userId = q.from.id;
  const parts = q.data.split(':');

  // Validasi format callback
  if (parts.length !== 3 || parts[0] !== 'absen' || !VALID_STATUS.includes(parts[1])) {
    return bot.answerCallbackQuery(q.id, { text: '❌ Data tidak valid.' });
  }

  const status = parts[1];
  const outletId = parseInt(parts[2]);
  const today = getToday();

  // Rate limit callback
  if (isRateLimited(userId, 'absen_callback', 5)) {
    return bot.answerCallbackQuery(q.id, { text: '⏳ Terlalu banyak request.' });
  }

  // Validasi user masih member aktif di outlet ini
  const isMember = await isActiveMember(userId, outletId);
  if (!isMember) {
    return bot.answerCallbackQuery(q.id, { text: '❌ Kamu bukan anggota aktif outlet ini.' });
  }

  await dbQuery(() =>
    supabase.from('absen').upsert({
      outlet_id: outletId,
      telegram_id: userId,
      date: today,
      status
    }, { onConflict: 'outlet_id,telegram_id,date' })
  );

  // Selalu answer callback agar tombol tidak loading terus
  await bot.answerCallbackQuery(q.id, { text: `${formatStatus(status)} tercatat!` });

  // Edit pesan asli → hapus tombol
  try {
    await bot.editMessageText(
      `✅ Absen tercatat: *${formatStatus(status)}*`,
      {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        parse_mode: 'Markdown'
      }
    );
  } catch { /* pesan sudah di-edit sebelumnya, skip */ }
}


function register(bot) {
  bot.onText(/\/absen$/, (msg) => handleAbsen(bot, msg));

  // Callback query — filter hanya yang prefix "absen:"
  bot.on('callback_query', async (q) => {
    if (!q.data?.startsWith('absen:')) return;
    try {
      await handleAbsenCallback(bot, q);
    } catch (err) {
      console.error('[ABSEN CALLBACK ERROR]', err.message);
      bot.answerCallbackQuery(q.id, { text: '⚠️ Error, coba lagi.' });
    }
  });
}

module.exports = { register };