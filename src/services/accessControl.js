/**
 * Super-admin check. The app's only access rule that lives client-side: the
 * one super-admin account by email. Everything else (coach vs client) comes
 * from the user's role in the database.
 *
 * This file used to hold a full role/approval RBAC layer (pending-coach
 * checks, application approval permissions, route guards) that nothing
 * imported; removed 2026-09-28 along with the coach approval flow.
 */

export const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

export const isSuperAdmin = (email) => {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL;
};
