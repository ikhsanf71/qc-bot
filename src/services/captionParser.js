const { QC_TYPE } = require('../config/constants');

function parseCaption(caption) {
  if (!caption) return null;
  const cleaned = caption.trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' - ').map(p => p.trim());
  if (parts.length !== 5) return null;

  const [name, typeRaw, treatment, timeRange, outletName] = parts;
  const type = typeRaw.toLowerCase();
  if (type !== QC_TYPE.BEFORE && type !== QC_TYPE.AFTER) return null;

  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(timeRange)) return null;

  const [startTime, endTime] = timeRange.split('-');
  if (name.length < 2 || treatment.length < 2 || outletName.length < 1) return null;

  return { name, type, treatment, startTime, endTime, outletName };
}

module.exports = { parseCaption };