const { STATUS, PERFORMANCE } = require('../config/constants');

function evaluateUserPerformance(absenRecord, qcStatus) {
  const hadir = (absenRecord.status === STATUS.HADIR);
  if (!hadir) {
    return { hadir: false, before: false, after: false, total_qc: 0, status: PERFORMANCE.WARNING };
  }
  const before = qcStatus.hasBefore;
  const after = qcStatus.hasAfter;
  const total_qc = (before ? 1 : 0) + (after ? 1 : 0);
  let status;
  if (before && after) status = PERFORMANCE.PERFORM;
  else if (before || after) status = PERFORMANCE.NORMAL;
  else status = PERFORMANCE.WARNING;
  return { hadir, before, after, total_qc, status };
}

module.exports = { evaluateUserPerformance };