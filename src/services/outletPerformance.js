const { OUTLET_SCORE } = require('../config/constants');

function calculateOutletScore(totalHadir, totalLengkap) {
  if (totalHadir === 0) return { score: 0, category: OUTLET_SCORE.PROBLEM.label };
  const score = (totalLengkap / totalHadir) * 100;
  let category;
  if (score >= OUTLET_SCORE.EXCELLENT.min) category = OUTLET_SCORE.EXCELLENT.label;
  else if (score >= OUTLET_SCORE.OK.min) category = OUTLET_SCORE.OK.label;
  else category = OUTLET_SCORE.PROBLEM.label;
  return { score: Math.round(score), category };
}

module.exports = { calculateOutletScore };