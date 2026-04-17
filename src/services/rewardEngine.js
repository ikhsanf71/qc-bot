/**
 * Reward Engine Service
 * Menentukan staff yang layak mendapat reward (consistent, improvement, active)
 */

const supabase = require('../../db');
const { getToday } = require('../../utils');

// Konfigurasi
const MAX_REWARD_PER_DAY = 3;
const CONSISTENT_DAYS_REQUIRED = 5; // 5 hari berturut-turut QC lengkap
const IMPROVEMENT_THRESHOLD = 10; // Peningkatan score minimal 10 poin

/**
 * Cek apakah staff sudah mendapat reward hari ini
 * @param {number} telegramId 
 * @param {string} rewardType 
 * @param {string} date 
 * @returns {Promise<boolean>}
 */
async function hasReceivedRewardToday(telegramId, rewardType, date) {
  const { data } = await supabase
    .from('reward_log')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('reward_type', rewardType)
    .eq('date', date)
    .maybeSingle();
  
  return !!data;
}

/**
 * Log reward ke database
 * @param {number} telegramId 
 * @param {string} rewardType 
 * @param {string} date 
 */
async function logReward(telegramId, rewardType, date) {
  await supabase
    .from('reward_log')
    .insert({
      telegram_id: telegramId,
      reward_type: rewardType,
      date: date
    });
  console.log(`[REWARD] ${rewardType} untuk user ${telegramId} pada ${date}`);
}

/**
 * Cek staff dengan CONSISTENT reward
 * Syarat: QC lengkap minimal 5 hari berturut-turut
 * @param {Array} staffList 
 * @param {string} date 
 * @returns {Promise<Array>}
 */
async function checkConsistentReward(staffList, date) {
  const eligible = [];
  
  for (const staff of staffList) {
    // Cek apakah sudah dapat reward hari ini
    if (await hasReceivedRewardToday(staff.telegram_id, 'consistent', date)) {
      continue;
    }
    
    // Ambil QC logs 7 hari terakhir
    const { data: qcLogs } = await supabase
      .from('qc_logs')
      .select('date, type')
      .eq('telegram_id', staff.telegram_id)
      .gte('date', `${date.slice(0, 10)}` - 7)
      .lte('date', date);
    
    // Hitung QC lengkap per hari
    const qcByDate = {};
    qcLogs?.forEach(log => {
      if (!qcByDate[log.date]) qcByDate[log.date] = { before: false, after: false };
      qcByDate[log.date][log.type] = true;
    });
    
    // Cek hari berturut-turut
    let streak = 0;
    let currentDate = new Date(date);
    
    for (let i = 0; i < 10; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const qc = qcByDate[dateStr];
      const isComplete = qc?.before && qc?.after;
      
      if (isComplete) {
        streak++;
      } else {
        break;
      }
      currentDate.setDate(currentDate.getDate() - 1);
    }
    
    if (streak >= CONSISTENT_DAYS_REQUIRED) {
      eligible.push({
        ...staff,
        streak
      });
    }
  }
  
  return eligible;
}

/**
 * Cek staff dengan IMPROVEMENT reward
 * Syarat: Score naik minimal 10 poin dari minggu lalu
 * @param {Array} progressResults 
 * @param {string} date 
 * @returns {Promise<Array>}
 */
async function checkImprovementReward(progressResults, date) {
  const eligible = [];
  
  for (const staff of progressResults) {
    // Cek apakah sudah dapat reward hari ini
    if (await hasReceivedRewardToday(staff.telegram_id, 'improvement', date)) {
      continue;
    }
    
    // Hanya yang trend 'up' dan peningkatan signifikan
    if (staff.trend === 'up' && (staff.score - staff.previousScore) >= IMPROVEMENT_THRESHOLD) {
      eligible.push(staff);
    }
  }
  
  return eligible;
}

/**
 * Cek staff dengan ACTIVE reward
 * Syarat: Paling cepat absen + QC lengkap hari ini
 * @param {number} outletId 
 * @param {string} date 
 * @returns {Promise<Array>}
 */
async function checkActiveReward(outletId, date) {
  // Ambil staff yang hadir dan QC lengkap hari ini
  const { data: absenList } = await supabase
    .from('absen')
    .select('telegram_id, created_at, users(full_name)')
    .eq('outlet_id', outletId)
    .eq('date', date)
    .eq('status', 'h')
    .order('created_at', { ascending: true });
  
  if (!absenList || absenList.length === 0) return [];
  
  // Ambil QC lengkap
  const { data: qcLogs } = await supabase
    .from('qc_logs')
    .select('telegram_id, type')
    .eq('outlet_id', outletId)
    .eq('date', date);
  
  const qcMap = {};
  qcLogs?.forEach(log => {
    if (!qcMap[log.telegram_id]) qcMap[log.telegram_id] = { before: false, after: false };
    qcMap[log.telegram_id][log.type] = true;
  });
  
  const eligible = [];
  for (const absen of absenList) {
    const qc = qcMap[absen.telegram_id];
    if (qc?.before && qc?.after) {
      eligible.push({
        telegram_id: absen.telegram_id,
        name: absen.users?.full_name || `User ${absen.telegram_id}`,
        absenTime: absen.created_at
      });
    }
  }
  
  // Ambil 1 tercepat
  return eligible.slice(0, 1);
}

/**
 * Pilih reward untuk dikirim (max 3 per hari, random)
 * @param {Array} eligibleStaff 
 * @param {number} maxCount 
 * @returns {Array}
 */
function selectRewards(eligibleStaff, maxCount = MAX_REWARD_PER_DAY) {
  // Acak urutan
  const shuffled = [...eligibleStaff];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, maxCount);
}

/**
 * Generate reward untuk satu outlet
 * @param {number} outletId 
 * @param {string} outletName 
 * @param {Array} progressResults 
 * @param {string} date 
 * @returns {Promise<Array>} List reward yang dipilih
 */
async function generateOutletRewards(outletId, outletName, progressResults, date) {
  const allEligible = [];
  
  // 1. Consistent reward
  const staffList = progressResults.map(p => ({
    telegram_id: p.telegram_id,
    name: p.name
  }));
  const consistentEligible = await checkConsistentReward(staffList, date);
  consistentEligible.forEach(s => {
    allEligible.push({
      ...s,
      rewardType: 'consistent',
      outletName
    });
  });
  
  // 2. Improvement reward
  const improvementEligible = await checkImprovementReward(progressResults, date);
  improvementEligible.forEach(s => {
    allEligible.push({
      telegram_id: s.telegram_id,
      name: s.name,
      rewardType: 'improvement',
      outletName,
      improvement: s.score - s.previousScore
    });
  });
  
  // 3. Active reward (hanya 1 per outlet)
  const activeEligible = await checkActiveReward(outletId, date);
  activeEligible.forEach(s => {
    allEligible.push({
      telegram_id: s.telegram_id,
      name: s.name,
      rewardType: 'active',
      outletName
    });
  });
  
  // Pilih reward (max 3, random)
  const selectedRewards = selectRewards(allEligible, MAX_REWARD_PER_DAY);
  
  // Log reward yang dipilih
  for (const reward of selectedRewards) {
    await logReward(reward.telegram_id, reward.rewardType, date);
  }
  
  return selectedRewards;
}

module.exports = {
  generateOutletRewards,
  checkConsistentReward,
  checkImprovementReward,
  checkActiveReward,
  selectRewards,
  hasReceivedRewardToday,
  logReward
};