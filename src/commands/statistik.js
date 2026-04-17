const supabase = require('../../db');
const { escapeMarkdown, commandPattern } = require('../../utils');
const { isOwner } = require('../middleware');

async function handleStatistik(bot, msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, '⛔ Hanya owner yang bisa melihat statistik bulanan.');
  }

  // Parse bulan/tahun dari command, default bulan ini
  let bulan = new Date().getMonth() + 1;
  let tahun = new Date().getFullYear();
  
  if (match[1]) {
    const input = match[1].trim();
    if (input.match(/^\d{4}-\d{2}$/)) {
      [tahun, bulan] = input.split('-').map(Number);
    } else if (input.match(/^\d{2}-\d{4}$/)) {
      [bulan, tahun] = input.split('-').map(Number);
    }
  }

  const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-31`;

  await bot.sendMessage(chatId, `⏳ Menghitung statistik bulan ${bulan}/${tahun}...`);

  // Ambil semua outlet
  const { data: outlets } = await supabase.from('outlets').select('id, name').eq('is_active', true);
  
  if (!outlets || outlets.length === 0) {
    return bot.sendMessage(chatId, '❌ Belum ada outlet.');
  }

  let laporan = `📊 *STATISTIK BULANAN* - ${bulan}/${tahun}\n\n`;

  for (const outlet of outlets) {
    // Ambil data absen sebulan
    const { data: absenList } = await supabase
      .from('absen')
      .select('telegram_id, status, date')
      .eq('outlet_id', outlet.id)
      .gte('date', startDate)
      .lte('date', endDate);

    // Ambil data QC sebulan
    const { data: qcList } = await supabase
      .from('qc_logs')
      .select('telegram_id, type, date')
      .eq('outlet_id', outlet.id)
      .gte('date', startDate)
      .lte('date', endDate);

    // Ambil semua staff outlet
    const { data: staffList } = await supabase
      .from('outlet_members')
      .select('telegram_id, users(full_name)')
      .eq('outlet_id', outlet.id)
      .eq('is_active', true)
      .eq('role', 'staff');

    const staffCount = staffList?.length || 1;
    
    // Hitung statistik
    const uniqueStaff = new Set(absenList?.map(a => a.telegram_id) || []);
    const totalHadir = absenList?.filter(a => a.status === 'h').length || 0;
    const totalHari = new Set(absenList?.map(a => a.date) || []).size;
    
    // Hitung QC lengkap (user yang punya before & after di hari yang sama)
    const qcByUserDate = {};
    qcList?.forEach(q => {
      const key = `${q.telegram_id}:${q.date}`;
      if (!qcByUserDate[key]) qcByUserDate[key] = new Set();
      qcByUserDate[key].add(q.type);
    });
    const qcLengkap = Object.values(qcByUserDate).filter(s => s.has('before') && s.has('after')).length;

    const rataKehadiran = totalHari > 0 ? Math.round((totalHadir / (staffCount * totalHari)) * 100) : 0;
    const rataKedisiplinan = totalHadir > 0 ? Math.round((qcLengkap / totalHadir) * 100) : 0;

    laporan += `🏪 *${escapeMarkdown(outlet.name)}*\n`;
    laporan += `   📅 Hari aktif: ${totalHari}\n`;
    laporan += `   👥 Total staff: ${staffCount}\n`;
    laporan += `   ✅ Rata-rata kehadiran: ${rataKehadiran}%\n`;
    laporan += `   📸 Rata-rata disiplin QC: ${rataKedisiplinan}%\n\n`;
  }

  // Summary semua outlet
  laporan += `📈 *SUMMARY ${bulan}/${tahun}*\n`;
  laporan += `🏪 Total outlet: ${outlets.length}\n`;
  laporan += `📊 Ketik /statistik YYYY-MM untuk bulan lain\n`;
  laporan += `   Contoh: /statistik 2026-03`;

  await bot.sendMessage(chatId, laporan, { parse_mode: 'Markdown' });
}

function register(bot) {
  bot.onText(commandPattern('statistik'), (msg, match) => handleStatistik(bot, msg, match));
  bot.onText(commandPattern('bulanan'), (msg, match) => handleStatistik(bot, msg, match));
}

module.exports = { register };