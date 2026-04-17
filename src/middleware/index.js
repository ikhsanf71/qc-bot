// src/middleware/index.js
const middleware = require('../middleware');

module.exports = {
  ROLES: middleware.ROLES,
  OWNER_IDS: middleware.OWNER_IDS,
  isOwner: middleware.isOwner,
  hasRole: middleware.hasRole,
  isManagerOrOwner: middleware.isManagerOrOwner,
  isActiveMember: middleware.isActiveMember,
  isStaff: async (telegramId, outletId) => {
    return middleware.hasRole(telegramId, outletId, [middleware.ROLES.STAFF]);
  },
  isRateLimited: middleware.isRateLimited,
  withErrorHandler: middleware.withErrorHandler,
  withCallbackErrorHandler: middleware.withCallbackErrorHandler,
  auditLog: middleware.auditLog
};