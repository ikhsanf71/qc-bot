module.exports = {
  STATUS: {
    HADIR: 'h',
    IZIN: 'i',
    SAKIT: 's',
    LIBUR: 'l'
  },
  QC_TYPE: {
    BEFORE: 'before',
    AFTER: 'after'
  },
  PERFORMANCE: {
    PERFORM: 'PERFORM',
    NORMAL: 'NORMAL',
    WARNING: 'WARNING'
  },
  OUTLET_SCORE: {
    EXCELLENT: { min: 85, label: 'EXCELLENT' },
    OK: { min: 70, max: 84, label: 'OK' },
    PROBLEM: { max: 69, label: 'PROBLEM' }
  },
  REMINDER_TIMES: {
    BEFORE: '0 4 * * *',    // 11:00 WIB (UTC+7)
    PROGRESS: '0 7 * * *',   // 14:00 WIB
    AFTER: '0 10 * * *',     // 17:00 WIB
    WARNING: '30 14 * * *'    // 21:30 WIB
  },
  DAILY_REPORT_TIME: '5 15 * * *'  // 22:05 WIB
};