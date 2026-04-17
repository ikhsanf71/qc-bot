const supabase = require('../../db');
const { getToday } = require('../../utils');
const { STATUS, QC_TYPE } = require('../config/constants');

async function validateQCUpload(outletId, userId, type) {
  const today = getToday();
  const { data: absen } = await supabase
    .from('absen')
    .select('*')
    .eq('outlet_id', outletId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!absen) return { valid: false, message: '❌ Anda belum absen hari ini. Silakan /absen dulu.' };
  if (absen.status !== STATUS.HADIR) return { valid: false, message: '⚠️ Status Anda bukan Hadir. Tidak perlu kirim foto.' };

  const { data: existing } = await supabase
    .from('qc_logs')
    .select('id')
    .eq('outlet_id', outletId)
    .eq('telegram_id', userId)
    .eq('date', today)
    .eq('type', type)
    .maybeSingle();

  if (existing) return { valid: false, message: `⚠️ Anda sudah mengirim foto *${type}* hari ini.` };

  return { valid: true, absenData: absen };
}

async function getUserQCStatus(outletId, userId, date) {
  const { data: logs } = await supabase
    .from('qc_logs')
    .select('type')
    .eq('outlet_id', outletId)
    .eq('telegram_id', userId)
    .eq('date', date);
  const hasBefore = logs?.some(l => l.type === QC_TYPE.BEFORE) || false;
  const hasAfter = logs?.some(l => l.type === QC_TYPE.AFTER) || false;
  return { hasBefore, hasAfter, isComplete: hasBefore && hasAfter };
}

module.exports = { validateQCUpload, getUserQCStatus };