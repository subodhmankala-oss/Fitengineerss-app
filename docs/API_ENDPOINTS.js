/**
 * FitEngineers API Routes Documentation
 * Role-based endpoint structure with access control
 */

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * POST /api/auth/google
 * Google OAuth authentication
 * 
 * Input:
 *   - id_token (string): Google ID token
 * 
 * Output:
 *   - user_id (UUID)
 *   - email (string)
 *   - role (string): 'client', 'coach', 'super-admin'
 *   - approved (boolean): if coach, whether approved
 *   - auth_token (string): Session token
 * 
 * Redirect:
 *   - super-admin → /admin-dashboard
 *   - coach (approved) → /coach-dashboard
 *   - coach (pending) → /coach-applications
 *   - client → /dashboard
 * 
 * Protected: ❌ No
 * Rate Limit: 10/hour per IP
 */
export const authGoogleEndpoint = {
  method: 'POST',
  path: '/api/auth/google',
  public: true,
  rateLimit: '10/hour'
};


/**
 * POST /api/auth/logout
 * Logout current user
 * 
 * Output:
 *   - success (boolean)
 *   - message (string)
 * 
 * Protected: ✅ Yes
 * Requires: Any authenticated user
 */
export const authLogoutEndpoint = {
  method: 'POST',
  path: '/api/auth/logout',
  protected: true,
  requiresRole: ['client', 'coach', 'super-admin']
};


/**
 * GET /api/auth/me
 * Get current user profile
 * 
 * Output:
 *   - id (UUID)
 *   - email (string)
 *   - full_name (string)
 *   - role (string)
 *   - profile (object)
 *   - verified (boolean)
 * 
 * Protected: ✅ Yes
 * Requires: Any authenticated user
 */
export const authMeEndpoint = {
  method: 'GET',
  path: '/api/auth/me',
  protected: true,
  requiresRole: ['client', 'coach', 'super-admin']
};


// ==========================================
// ADMIN ENDPOINTS (/api/admin)
// ==========================================

/**
 * GET /api/admin/users
 * Get all users on platform
 * 
 * Query Parameters:
 *   - role: 'client', 'coach', 'super-admin'
 *   - status: 'active', 'inactive'
 *   - verified: true/false
 *   - limit: number (default 50)
 *   - offset: number (default 0)
 * 
 * Output:
 *   - users (array): User objects
 *   - total (number)
 *   - limit (number)
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 * Audit: ✅ Logged
 */
export const adminGetUsersEndpoint = {
  method: 'GET',
  path: '/api/admin/users',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com',
  audit: true
};


/**
 * GET /api/admin/applications
 * Get all coach applications
 * 
 * Query Parameters:
 *   - status: 'pending', 'approved', 'rejected'
 *   - sort: 'date', 'name'
 *   - limit: number
 *   - offset: number
 * 
 * Output:
 *   - applications (array): Application objects
 *   - total (number)
 *   - pending_count (number)
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 * Audit: ✅ Logged
 */
export const adminGetApplicationsEndpoint = {
  method: 'GET',
  path: '/api/admin/applications',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com',
  audit: true
};


/**
 * POST /api/admin/applications/:id/approve
 * Approve coach application
 * 
 * URL Parameters:
 *   - id: application UUID
 * 
 * Input:
 *   - notes (string, optional)
 * 
 * Output:
 *   - success (boolean)
 *   - coach_id (UUID)
 *   - message (string)
 * 
 * Actions:
 *   1. Update application status to 'approved'
 *   2. Create coach_profile record
 *   3. Update user role to 'coach'
 *   4. Set user.verified = true
 *   5. Send approval email
 *   6. Create audit log
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 * Audit: ✅ Logged
 */
export const adminApproveApplicationEndpoint = {
  method: 'POST',
  path: '/api/admin/applications/:id/approve',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com',
  audit: true
};


/**
 * POST /api/admin/applications/:id/reject
 * Reject coach application
 * 
 * URL Parameters:
 *   - id: application UUID
 * 
 * Input:
 *   - reason (string, required)
 *   - notes (string, optional)
 * 
 * Output:
 *   - success (boolean)
 *   - message (string)
 * 
 * Actions:
 *   1. Update application status to 'rejected'
 *   2. Store rejection reason
 *   3. Send rejection email
 *   4. Create audit log
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 * Audit: ✅ Logged
 */
export const adminRejectApplicationEndpoint = {
  method: 'POST',
  path: '/api/admin/applications/:id/reject',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com',
  audit: true
};


/**
 * DELETE /api/admin/users/:id
 * Remove user account (soft delete)
 * 
 * URL Parameters:
 *   - id: user UUID
 * 
 * Output:
 *   - success (boolean)
 *   - message (string)
 * 
 * Actions:
 *   1. Set user.active = false
 *   2. Create audit log
 *   3. Send notification
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 * Audit: ✅ Logged
 */
export const adminDeleteUserEndpoint = {
  method: 'DELETE',
  path: '/api/admin/users/:id',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com',
  audit: true
};


/**
 * GET /api/admin/audit-logs
 * Get system audit logs
 * 
 * Query Parameters:
 *   - user_id: filter by admin
 *   - action: filter by action type
 *   - resource_type: filter by resource
 *   - limit: number
 * 
 * Output:
 *   - logs (array): Audit log entries
 * 
 * Protected: ✅ Yes
 * Requires: super-admin
 * Email: subodhmankala@gmail.com only
 */
export const adminGetAuditLogsEndpoint = {
  method: 'GET',
  path: '/api/admin/audit-logs',
  protected: true,
  requiresRole: ['super-admin'],
  requiresEmail: 'subodhmankala@gmail.com'
};


// ==========================================
// COACH ENDPOINTS (/api/coach)
// ==========================================

/**
 * GET /api/coach/profile
 * Get coach profile
 * 
 * Output:
 *   - id (UUID)
 *   - user (object)
 *   - certifications (array)
 *   - experience_years (number)
 *   - specialization (string)
 *   - clients_count (number)
 *   - rating (number)
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Own profile only
 */
export const coachGetProfileEndpoint = {
  method: 'GET',
  path: '/api/coach/profile',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'own'
};


/**
 * PUT /api/coach/profile
 * Update coach profile
 * 
 * Input:
 *   - bio (string)
 *   - certifications (array)
 *   - specialization (string)
 *   - social_media_handle (string)
 *   - hourly_rate (number)
 *   - max_clients (number)
 * 
 * Output:
 *   - success (boolean)
 *   - profile (object)
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Own profile only
 * Audit: ✅ Logged
 */
export const coachUpdateProfileEndpoint = {
  method: 'PUT',
  path: '/api/coach/profile',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'own',
  audit: true
};


/**
 * GET /api/coach/clients
 * Get coach's clients
 * 
 * Query Parameters:
 *   - status: 'active', 'paused', 'completed'
 *   - limit: number
 * 
 * Output:
 *   - clients (array): Client profiles
 *   - total (number)
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Own clients only
 */
export const coachGetClientsEndpoint = {
  method: 'GET',
  path: '/api/coach/clients',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'own_clients'
};


/**
 * GET /api/coach/clients/:client_id
 * Get specific client details
 * 
 * URL Parameters:
 *   - client_id: client UUID
 * 
 * Output:
 *   - client (object): Full client profile + metrics
 *   - progress (object): Recent progress data
 *   - workouts (array): Recent workouts
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Must be their client
 */
export const coachGetClientDetailEndpoint = {
  method: 'GET',
  path: '/api/coach/clients/:client_id',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'must_own_client'
};


/**
 * POST /api/coach/workout-plans
 * Create workout plan for client
 * 
 * Input:
 *   - client_id (UUID)
 *   - plan_name (string)
 *   - exercises (array)
 *   - duration_weeks (number)
 *   - difficulty_level (string)
 * 
 * Output:
 *   - success (boolean)
 *   - plan_id (UUID)
 *   - plan (object)
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Must be client's coach
 * Audit: ✅ Logged
 */
export const coachCreateWorkoutPlanEndpoint = {
  method: 'POST',
  path: '/api/coach/workout-plans',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'must_own_client',
  audit: true
};


/**
 * GET /api/coach/clients/:client_id/progress
 * Get client progress history
 * 
 * URL Parameters:
 *   - client_id: client UUID
 * 
 * Query Parameters:
 *   - limit: number (default 30)
 *   - type: 'weight', 'measurements', 'workout'
 * 
 * Output:
 *   - progress (array): Progress entries
 *   - charts (object): Chart data
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Must be their client
 */
export const coachGetClientProgressEndpoint = {
  method: 'GET',
  path: '/api/coach/clients/:client_id/progress',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'must_own_client'
};


/**
 * POST /api/coach/messages
 * Send message to client
 * 
 * Input:
 *   - receiver_id (UUID)
 *   - message (string)
 *   - file_url (string, optional)
 * 
 * Output:
 *   - success (boolean)
 *   - message_id (UUID)
 * 
 * Protected: ✅ Yes
 * Requires: coach (approved)
 * Ownership: Must be their client
 */
export const coachSendMessageEndpoint = {
  method: 'POST',
  path: '/api/coach/messages',
  protected: true,
  requiresRole: ['coach'],
  requiresApproval: true,
  ownership: 'must_own_client'
};


// ==========================================
// CLIENT ENDPOINTS (/api/client)
// ==========================================

/**
 * GET /api/client/profile
 * Get client profile
 * 
 * Output:
 *   - id (UUID)
 *   - user (object)
 *   - measurements (object)
 *   - goals (object)
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own profile only
 */
export const clientGetProfileEndpoint = {
  method: 'GET',
  path: '/api/client/profile',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * PUT /api/client/profile
 * Update client profile
 * 
 * Input:
 *   - age (number)
 *   - weight_kg (number)
 *   - height_cm (number)
 *   - fitness_goal (string)
 *   - activity_level (string)
 * 
 * Output:
 *   - success (boolean)
 *   - profile (object)
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own profile only
 */
export const clientUpdateProfileEndpoint = {
  method: 'PUT',
  path: '/api/client/profile',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * GET /api/client/workouts
 * Get assigned workout plans
 * 
 * Output:
 *   - workouts (array): Assigned plans
 *   - current (object): Current active plan
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own data only
 */
export const clientGetWorkoutsEndpoint = {
  method: 'GET',
  path: '/api/client/workouts',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * POST /api/client/workouts/:plan_id/log
 * Log workout completion
 * 
 * URL Parameters:
 *   - plan_id: workout plan UUID
 * 
 * Input:
 *   - exercises (array): Completed exercises
 *   - duration_minutes (number)
 *   - notes (string)
 * 
 * Output:
 *   - success (boolean)
 *   - log_id (UUID)
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own workouts only
 */
export const clientLogWorkoutEndpoint = {
  method: 'POST',
  path: '/api/client/workouts/:plan_id/log',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own_workouts'
};


/**
 * POST /api/client/progress
 * Update progress measurements
 * 
 * Input:
 *   - weight_kg (number)
 *   - measurements (object)
 *   - photos (array, optional)
 *   - notes (string)
 * 
 * Output:
 *   - success (boolean)
 *   - progress_id (UUID)
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own data only
 */
export const clientUpdateProgressEndpoint = {
  method: 'POST',
  path: '/api/client/progress',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * GET /api/client/nutrition
 * Get assigned meal plans
 * 
 * Output:
 *   - meal_plans (array): Assigned plans
 *   - current (object): Current active plan
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own data only
 */
export const clientGetNutritionEndpoint = {
  method: 'GET',
  path: '/api/client/nutrition',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * GET /api/client/coaches
 * Get assigned coaches
 * 
 * Output:
 *   - coaches (array): Assigned coaches
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Own coaches only
 */
export const clientGetCoachesEndpoint = {
  method: 'GET',
  path: '/api/client/coaches',
  protected: true,
  requiresRole: ['client'],
  ownership: 'own'
};


/**
 * POST /api/client/messages
 * Send message to coach
 * 
 * Input:
 *   - receiver_id (UUID)
 *   - message (string)
 * 
 * Output:
 *   - success (boolean)
 *   - message_id (UUID)
 * 
 * Protected: ✅ Yes
 * Requires: client
 * Ownership: Must be their coach
 */
export const clientSendMessageEndpoint = {
  method: 'POST',
  path: '/api/client/messages',
  protected: true,
  requiresRole: ['client'],
  ownership: 'must_have_coach'
};


// ==========================================
// COACH APPLICATION ENDPOINTS
// ==========================================

/**
 * POST /api/coach/applications
 * Submit coach application
 * 
 * Input:
 *   - certifications (string)
 *   - experience_years (number)
 *   - specialization (string)
 *   - social_media_handle (string)
 *   - location (string)
 * 
 * Output:
 *   - success (boolean)
 *   - application_id (UUID)
 *   - status (string): 'pending'
 * 
 * Protected: ✅ Yes (after Google auth)
 * Requires: Authenticated user without coach role
 * Audit: ✅ Logged
 */
export const submitCoachApplicationEndpoint = {
  method: 'POST',
  path: '/api/coach/applications',
  protected: true,
  requiresRole: ['client'],
  audit: true
};


/**
 * GET /api/coach/applications/status
 * Get current application status
 * 
 * Output:
 *   - status (string): 'pending', 'approved', 'rejected'
 *   - application (object)
 *   - message (string)
 * 
 * Protected: ✅ Yes
 * Requires: Authenticated user with pending coach role
 */
export const checkApplicationStatusEndpoint = {
  method: 'GET',
  path: '/api/coach/applications/status',
  protected: true,
  requiresRole: ['client', 'coach']
};


// ==========================================
// ERROR RESPONSES
// ==========================================

export const API_RESPONSES = {
  // Success responses (2xx)
  OK: { code: 200, message: 'OK' },
  CREATED: { code: 201, message: 'Created' },
  
  // Client errors (4xx)
  BAD_REQUEST: { code: 400, message: 'Bad request' },
  UNAUTHORIZED: { code: 401, message: 'Unauthorized' },
  FORBIDDEN: { code: 403, message: 'Forbidden' },
  NOT_FOUND: { code: 404, message: 'Not found' },
  CONFLICT: { code: 409, message: 'Conflict' },
  
  // Server errors (5xx)
  INTERNAL_ERROR: { code: 500, message: 'Internal server error' }
};

// ==========================================
// RATE LIMITING
// ==========================================

export const RATE_LIMITS = {
  PUBLIC: '10/hour',
  AUTHENTICATED: '100/hour',
  ADMIN: '1000/hour',
  PAYMENT: '5/hour'
};

// ==========================================
// EXPORT
// ==========================================

export default {
  authGoogleEndpoint,
  authLogoutEndpoint,
  authMeEndpoint,
  adminGetUsersEndpoint,
  adminGetApplicationsEndpoint,
  adminApproveApplicationEndpoint,
  adminRejectApplicationEndpoint,
  adminDeleteUserEndpoint,
  adminGetAuditLogsEndpoint,
  coachGetProfileEndpoint,
  coachUpdateProfileEndpoint,
  coachGetClientsEndpoint,
  coachGetClientDetailEndpoint,
  coachCreateWorkoutPlanEndpoint,
  coachGetClientProgressEndpoint,
  coachSendMessageEndpoint,
  clientGetProfileEndpoint,
  clientUpdateProfileEndpoint,
  clientGetWorkoutsEndpoint,
  clientLogWorkoutEndpoint,
  clientUpdateProgressEndpoint,
  clientGetNutritionEndpoint,
  clientGetCoachesEndpoint,
  clientSendMessageEndpoint,
  submitCoachApplicationEndpoint,
  checkApplicationStatusEndpoint,
  API_RESPONSES,
  RATE_LIMITS
};
