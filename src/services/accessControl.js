/**
 * Access Control & Authorization Utilities
 * Implements role-based access control (RBAC) for FitEngineers
 */

// ==========================================
// CONSTANTS
// ==========================================

export const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

export const USER_ROLES = {
  SUPER_ADMIN: 'super-admin',
  COACH: 'coach',
  CLIENT: 'client'
};

export const ROLE_DASHBOARDS = {
  'super-admin': '/admin-dashboard',
  'coach': '/coach-dashboard',
  'client': '/dashboard'
};

export const ROLE_API_PREFIX = {
  'super-admin': '/api/admin',
  'coach': '/api/coach',
  'client': '/api/client'
};

// ==========================================
// ROLE CHECKING FUNCTIONS
// ==========================================

/**
 * Check if user is super admin (only for subodhmankala@gmail.com)
 */
export const isSuperAdmin = (email) => {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL;
};

/**
 * Check if user has coach role and is approved
 */
export const isApprovedCoach = (user) => {
  if (!user) return false;
  return user.role === USER_ROLES.COACH && user.approved === true;
};

/**
 * Check if user is pending coach applicant
 */
export const isPendingCoach = (user) => {
  if (!user) return false;
  return user.role === USER_ROLES.COACH && user.approved === false;
};

/**
 * Check if user is client
 */
export const isClient = (user) => {
  if (!user) return false;
  return user.role === USER_ROLES.CLIENT;
};

// ==========================================
// ROLE AUTHORIZATION CHECKS
// ==========================================

/**
 * Check if user can access admin features
 */
export const canAccessAdmin = (email) => {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL;
};

/**
 * Check if user can view applications
 */
export const canViewApplications = (email) => {
  return canAccessAdmin(email);
};

/**
 * Check if user can approve/reject applications
 */
export const canApproveApplications = (email) => {
  return canAccessAdmin(email);
};

/**
 * Check if user is coach's client
 */
export const isClientOfCoach = (userId, coachId, clientCoachMap) => {
  if (!clientCoachMap) return false;
  return clientCoachMap[userId] === coachId;
};

/**
 * Check if coach can access client data
 */
export const canCoachAccessClient = (coachId, clientId, relationships) => {
  if (!relationships) return false;
  return relationships.some(r => r.coach_id === coachId && r.client_id === clientId);
};

// ==========================================
// ROUTE PROTECTION
// ==========================================

/**
 * Get dashboard URL based on user role
 */
export const getDashboardURL = (user) => {
  if (!user) return '/login';
  
  // Super admin
  if (isSuperAdmin(user.email)) {
    return ROLE_DASHBOARDS['super-admin'];
  }
  
  // Approved coach
  if (isApprovedCoach(user)) {
    return ROLE_DASHBOARDS['coach'];
  }
  
  // Pending coach
  if (isPendingCoach(user)) {
    return '/coach-application';
  }
  
  // Client
  if (isClient(user)) {
    return ROLE_DASHBOARDS['client'];
  }
  
  // Unknown role
  return '/login';
};

/**
 * Check if user can access route
 */
export const canAccessRoute = (user, routeRequirements) => {
  if (!user || !routeRequirements) return false;
  
  const { requiredRoles, requiresApproval } = routeRequirements;
  
  // Check role
  if (!requiredRoles.includes(user.role)) {
    return false;
  }
  
  // Check approval if required
  if (requiresApproval && user.role === USER_ROLES.COACH) {
    return user.approved === true;
  }
  
  return true;
};

// ==========================================
// PERMISSION CHECKS
// ==========================================

/**
 * Check if user can read data
 */
export const canReadData = (userId, ownerId, userRole) => {
  // User can read own data
  if (userId === ownerId) return true;
  
  // Admin can read all data
  if (userRole === USER_ROLES.SUPER_ADMIN) return true;
  
  return false;
};

/**
 * Check if user can write/update data
 */
export const canWriteData = (userId, ownerId, userRole) => {
  // User can write own data
  if (userId === ownerId) return true;
  
  // Admin can write all data
  if (userRole === USER_ROLES.SUPER_ADMIN) return true;
  
  return false;
};

/**
 * Check if coach can manage client
 */
export const canManageClient = (coachId, clientId, userRole, coachClientRelationships) => {
  if (!coachClientRelationships) return false;
  
  // Admin can manage anyone
  if (userRole === USER_ROLES.SUPER_ADMIN) return true;
  
  // Coach can only manage their clients
  if (userRole === USER_ROLES.COACH) {
    return coachClientRelationships.some(
      r => r.coach_id === coachId && r.client_id === clientId
    );
  }
  
  return false;
};

// ==========================================
// RESOURCE OWNERSHIP CHECKS
// ==========================================

/**
 * Verify user owns resource
 */
export const userOwnsResource = (userId, resourceOwnerId) => {
  return userId === resourceOwnerId;
};

/**
 * Verify coach owns client
 */
export const coachOwnsClient = (coachId, clientId, coachClientMap) => {
  if (!coachClientMap) return false;
  return coachClientMap.some(r => r.coach_id === coachId && r.client_id === clientId);
};

// ==========================================
// ERROR RESPONSES
// ==========================================

export const ACCESS_ERRORS = {
  UNAUTHORIZED: {
    code: 401,
    message: 'Unauthorized. Please log in.'
  },
  FORBIDDEN: {
    code: 403,
    message: 'Forbidden. You do not have permission to access this resource.'
  },
  ADMIN_ONLY: {
    code: 403,
    message: 'Admin access only. This action is restricted to platform administrators.'
  },
  APPROVAL_REQUIRED: {
    code: 403,
    message: 'Your coach account is pending approval. Please wait for admin review.'
  },
  INVALID_ROLE: {
    code: 403,
    message: 'Invalid user role. Please contact support.'
  }
};

// ==========================================
// MIDDLEWARE CREATORS
// ==========================================

/**
 * Create middleware to protect routes
 * Usage: if (!checkAuth(user)) return ACCESS_ERRORS.UNAUTHORIZED;
 */
export const checkAuth = (user) => {
  return user && user.id && user.email && user.role;
};

/**
 * Create middleware to check admin access
 */
export const checkAdminAccess = (email) => {
  if (!canAccessAdmin(email)) {
    throw new Error(ACCESS_ERRORS.ADMIN_ONLY.message);
  }
};

/**
 * Create middleware to check role
 */
export const checkRole = (user, requiredRoles) => {
  if (!user || !requiredRoles.includes(user.role)) {
    throw new Error(ACCESS_ERRORS.FORBIDDEN.message);
  }
};

/**
 * Create middleware to check approval (for coaches)
 */
export const checkApproval = (user) => {
  if (user.role === USER_ROLES.COACH && user.approved !== true) {
    throw new Error(ACCESS_ERRORS.APPROVAL_REQUIRED.message);
  }
};

// ==========================================
// AUDIT LOGGING
// ==========================================

/**
 * Create audit log entry
 */
export const createAuditLog = async (supabase, adminId, action, resourceType, resourceId, details, ip, userAgent) => {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      admin_id: adminId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: ip,
      user_agent: userAgent
    });
  
  if (error) {
    console.error('Audit log error:', error);
  }
};

// ==========================================
// EXPORT ALL FUNCTIONS
// ==========================================

export default {
  // Constants
  SUPER_ADMIN_EMAIL,
  USER_ROLES,
  ROLE_DASHBOARDS,
  ROLE_API_PREFIX,
  ACCESS_ERRORS,
  
  // Role checks
  isSuperAdmin,
  isApprovedCoach,
  isPendingCoach,
  isClient,
  
  // Authorization checks
  canAccessAdmin,
  canViewApplications,
  canApproveApplications,
  canCoachAccessClient,
  
  // Route protection
  getDashboardURL,
  canAccessRoute,
  
  // Permission checks
  canReadData,
  canWriteData,
  canManageClient,
  
  // Resource ownership
  userOwnsResource,
  coachOwnsClient,
  
  // Middleware
  checkAuth,
  checkAdminAccess,
  checkRole,
  checkApproval,
  
  // Audit
  createAuditLog
};
