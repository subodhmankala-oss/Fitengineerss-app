# FitEngineers Backend Architecture & Access Control

## 📋 Table of Contents
1. [Platform Ownership & Admin Access](#platform-ownership--admin-access)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Authentication Flow](#authentication-flow)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Access Control Rules](#access-control-rules)
7. [Security Implementation](#security-implementation)
8. [Coach Approval Workflow](#coach-approval-workflow)

---

## Platform Ownership & Admin Access

### Super Admin User
- **Email**: `subodhmankala@gmail.com`
- **Role**: `super-admin`
- **Access Level**: Full system access

### Restrictions
- ❌ Only `subodhmankala@gmail.com` can access Platform Admin Dashboard
- ❌ Only `subodhmankala@gmail.com` can view and approve coach applications
- ❌ Only `subodhmankala@gmail.com` can manage platform-wide settings
- ❌ No other user can have Platform Admin access
- ❌ Direct URL access to admin dashboards is blocked for non-admins

---

## User Roles & Permissions

### 1. Platform Admin (super-admin)
**Email**: `subodhmankala@gmail.com` only

**Permissions**:
- ✅ View all users, coaches, and clients
- ✅ View and manage coach applications
- ✅ Approve/reject coach applications
- ✅ Manage platform-wide settings
- ✅ View subscription and payment data
- ✅ Access admin dashboard
- ✅ View analytics and reporting
- ✅ Manage system notifications
- ✅ Remove/ban users or coaches
- ✅ Access audit logs

**Dashboard**: Admin Dashboard
**API Prefix**: `/api/admin/`

### 2. Coach (coach)
**Prerequisites**:
- Must submit coach application
- Application status must be `approved`
- Role auto-assigned after approval

**Permissions**:
- ✅ Manage own clients
- ✅ Create workout plans
- ✅ Assign meal plans to clients
- ✅ Track client attendance
- ✅ View client progress
- ✅ Send messages to clients
- ✅ Edit own profile
- ✅ Access coach dashboard
- ❌ Cannot access admin features
- ❌ Cannot view other coaches' clients
- ❌ Cannot access platform settings

**Dashboard**: Coach Dashboard
**API Prefix**: `/api/coach/`

### 3. Client (client)
**Access**: After onboarding or invited by coach

**Permissions**:
- ✅ View own data only
- ✅ View assigned workouts
- ✅ View assigned nutrition plans
- ✅ Update progress and measurements
- ✅ Log daily tracking (water, calories, etc.)
- ✅ Send messages to coach
- ✅ View own analytics
- ✅ Edit own profile
- ❌ Cannot access coach dashboard
- ❌ Cannot access admin features
- ❌ Cannot view other users' data

**Dashboard**: Client Dashboard
**API Prefix**: `/api/client/`

---

## Authentication Flow

### Step 1: Google Authentication
```
User clicks "Sign In with Google"
    ↓
Google OAuth Dialog
    ↓
User grants permissions
    ↓
Google returns ID token & email
    ↓
Supabase authenticates via Google
```

### Step 2: Role Determination
```
After successful Google auth:
    ↓
Check user.email in database
    ↓
Determine user role:
    - If email === "subodhmankala@gmail.com" → super-admin
    - If user.role === "coach" AND approved === true → coach
    - If user.role === "coach_pending" AND approved === false → show application form
    - If user.role === "client" → client
    ↓
Store role in localStorage and user profile
```

### Step 3: Role-Based Redirect
```
✅ super-admin → /admin-dashboard
✅ coach → /coach-dashboard
✅ client → /dashboard
✅ coach_pending → /coach-application-form
❌ Unauthorized role → /login
```

### Step 4: Session Management
```
On subsequent visits:
    ↓
Check Supabase session
    ↓
Fetch user profile from database
    ↓
Verify role and permissions
    ↓
Load appropriate dashboard
```

---

## Database Schema

### Tables Overview

#### 1. users
Core user data for all roles
```
- id (UUID) - Primary Key
- auth_id (UUID) - Supabase Auth ID
- email (TEXT UNIQUE) - User email
- full_name (TEXT)
- phone (TEXT UNIQUE)
- role (TEXT) - 'client', 'coach', 'super-admin'
- verified (BOOLEAN) - Email verified
- active (BOOLEAN) - Account active status
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- last_login (TIMESTAMP)
- profile_complete (BOOLEAN)
```

#### 2. user_profiles
Extended profile information
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- age (INTEGER)
- height_cm (NUMERIC)
- weight_kg (NUMERIC)
- activity_level (TEXT)
- fitness_goal (TEXT)
- dietary_preference (TEXT)
- calorie_target (INTEGER)
- protein_target (INTEGER)
- fats_target (INTEGER)
- carbs_target (INTEGER)
- bio (TEXT)
- avatar_url (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 3. coach_profiles
Coach-specific information
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- certifications (TEXT[])
- experience_years (INTEGER)
- specialization (TEXT)
- social_media_handle (TEXT)
- location (TEXT)
- bio (TEXT)
- hourly_rate (NUMERIC)
- availability (JSONB)
- max_clients (INTEGER)
- current_clients_count (INTEGER)
- rating (NUMERIC)
- total_reviews (INTEGER)
- approved (BOOLEAN)
- approval_date (TIMESTAMP)
- approved_by (UUID) - Foreign Key to users (super-admin)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 4. coach_applications
Coach application tracking
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- status (TEXT) - 'pending', 'approved', 'rejected'
- certifications (TEXT)
- experience_years (INTEGER)
- specialization (TEXT)
- social_media_handle (TEXT)
- location (TEXT)
- submission_date (TIMESTAMP)
- reviewed_at (TIMESTAMP)
- reviewed_by (UUID) - Foreign Key to users
- rejection_reason (TEXT)
- notes (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 5. coach_clients
Relationship between coaches and their clients
```
- id (UUID) - Primary Key
- coach_id (UUID) - Foreign Key to users (coach)
- client_id (UUID) - Foreign Key to users (client)
- status (TEXT) - 'active', 'paused', 'completed'
- join_date (TIMESTAMP)
- start_date (TIMESTAMP)
- end_date (TIMESTAMP)
- subscription_tier (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
UNIQUE(coach_id, client_id)
```

#### 6. workout_plans
Workout plan templates and assignments
```
- id (UUID) - Primary Key
- coach_id (UUID) - Foreign Key to users (coach who created)
- client_id (UUID) - Foreign Key to users (client assigned to)
- plan_name (TEXT)
- description (TEXT)
- exercises (JSONB) - Array of exercise objects
- duration_weeks (INTEGER)
- difficulty_level (TEXT)
- created_by (TEXT) - 'coach' or 'client'
- is_template (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 7. meal_plans
Meal plan templates and assignments
```
- id (UUID) - Primary Key
- coach_id (UUID) - Foreign Key to users
- client_id (UUID) - Foreign Key to users
- plan_name (TEXT)
- description (TEXT)
- meals (JSONB) - Array of meal objects
- macros (JSONB) - {protein, carbs, fats, calories}
- duration_days (INTEGER)
- created_by (TEXT) - 'coach' or 'client'
- is_template (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 8. workout_logs
Workout session tracking
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- plan_id (UUID) - Foreign Key to workout_plans
- log_date (DATE)
- exercise_name (TEXT)
- sets (JSONB) - Array of {set_number, reps, weight}
- total_volume_kg (NUMERIC)
- duration_minutes (INTEGER)
- notes (TEXT)
- created_at (TIMESTAMP)
```

#### 9. progress_tracking
Client progress history
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- coach_id (UUID) - Foreign Key to users (optional)
- track_date (DATE)
- weight_kg (NUMERIC)
- body_fat_percentage (NUMERIC)
- measurements (JSONB) - {chest, waist, hips, arms, thighs}
- photos (TEXT[])
- notes (TEXT)
- created_at (TIMESTAMP)
```

#### 9. attendance_records
Session attendance tracking
```
- id (UUID) - Primary Key
- coach_id (UUID) - Foreign Key to users
- client_id (UUID) - Foreign Key to users
- session_date (DATE)
- attended (BOOLEAN)
- duration_minutes (INTEGER)
- notes (TEXT)
- created_at (TIMESTAMP)
```

#### 10. chat_messages
Direct messaging between coaches and clients
```
- id (UUID) - Primary Key
- sender_id (UUID) - Foreign Key to users
- receiver_id (UUID) - Foreign Key to users
- message (TEXT)
- file_url (TEXT) - Optional attachment
- read (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 11. notifications
System and user notifications
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- type (TEXT) - 'info', 'warning', 'error', 'success'
- title (TEXT)
- message (TEXT)
- action_url (TEXT)
- read (BOOLEAN)
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP)
```

#### 12. subscriptions
Subscription and billing info
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- plan_type (TEXT) - 'free', 'basic', 'premium', 'elite'
- status (TEXT) - 'active', 'cancelled', 'expired', 'failed'
- start_date (TIMESTAMP)
- end_date (TIMESTAMP)
- auto_renew (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 13. payments
Payment transaction records
```
- id (UUID) - Primary Key
- user_id (UUID) - Foreign Key to users
- subscription_id (UUID) - Foreign Key to subscriptions
- amount (NUMERIC)
- currency (TEXT)
- status (TEXT) - 'pending', 'success', 'failed', 'refunded'
- transaction_id (TEXT) - Payment processor ID
- payment_method (TEXT)
- created_at (TIMESTAMP)
- processed_at (TIMESTAMP)
```

#### 14. audit_logs
Track admin actions and system events
```
- id (UUID) - Primary Key
- admin_id (UUID) - Foreign Key to users
- action (TEXT) - 'approve_coach', 'reject_coach', 'remove_user', etc
- resource_type (TEXT) - 'coach', 'user', 'application', etc
- resource_id (UUID)
- details (JSONB)
- ip_address (TEXT)
- user_agent (TEXT)
- created_at (TIMESTAMP)
```

---

## API Endpoints

### Authentication Endpoints
```
POST /api/auth/google
  - Authenticate with Google
  - Input: Google ID token
  - Output: User profile + role

POST /api/auth/logout
  - Logout current user
  - Input: None
  - Output: Success message

GET /api/auth/me
  - Get current user profile
  - Protected: All authenticated users
  - Output: User profile + role
```

### Admin Endpoints
```
Protected: super-admin only

GET /api/admin/users
  - Get all users
  - Query: ?role=coach&status=active&limit=50

GET /api/admin/users/:id
  - Get specific user details

GET /api/admin/applications
  - Get all coach applications
  - Query: ?status=pending&sort=date

GET /api/admin/applications/:id
  - Get application details

POST /api/admin/applications/:id/approve
  - Approve coach application
  - Input: { notes?: string }
  - Action: Create coach_profile, update user role

POST /api/admin/applications/:id/reject
  - Reject coach application
  - Input: { reason: string }
  - Action: Update application status

PUT /api/admin/settings
  - Update platform settings
  - Input: { setting_key, value }

GET /api/admin/analytics
  - Get platform analytics
  - Output: Users count, coaches count, revenue, etc

DELETE /api/admin/users/:id
  - Remove user account
  - Action: Soft delete + audit log

GET /api/admin/audit-logs
  - Get system audit logs
  - Query: ?user_id=uuid&action=approve_coach
```

### Coach Endpoints
```
Protected: coach role only, own data

GET /api/coach/profile
  - Get coach profile

PUT /api/coach/profile
  - Update coach profile
  - Input: { bio, certifications, etc }

GET /api/coach/clients
  - Get list of coach's clients
  - Output: Client profiles + metrics

GET /api/coach/clients/:client_id
  - Get specific client details
  - Authorization: Must be their coach

POST /api/coach/workout-plans
  - Create workout plan
  - Input: { plan_name, exercises[], duration_weeks }
  - Output: Created plan

GET /api/coach/workout-plans/:client_id
  - Get client's workout plans

PUT /api/coach/workout-plans/:plan_id
  - Update workout plan
  - Authorization: Must be plan creator

DELETE /api/coach/workout-plans/:plan_id
  - Delete workout plan

POST /api/coach/meal-plans
  - Create meal plan
  - Input: { plan_name, meals[], macros }

GET /api/coach/meal-plans/:client_id
  - Get client's meal plans

PUT /api/coach/clients/:client_id/attendance
  - Log client attendance
  - Input: { session_date, attended, duration_minutes }

GET /api/coach/clients/:client_id/progress
  - Get client progress history
  - Output: Weight, measurements, photos over time

GET /api/coach/messages/:client_id
  - Get messages with client

POST /api/coach/messages
  - Send message to client
  - Input: { receiver_id, message, file_url? }
```

### Client Endpoints
```
Protected: client role, own data only

GET /api/client/profile
  - Get own profile

PUT /api/client/profile
  - Update own profile
  - Input: { age, weight, fitness_goal, etc }

GET /api/client/coaches
  - Get assigned coaches

GET /api/client/workouts
  - Get assigned workout plans

GET /api/client/nutrition
  - Get assigned meal plans

POST /api/client/workouts/:plan_id/log
  - Log workout completion
  - Input: { exercises, duration_minutes }

POST /api/client/progress
  - Update progress measurements
  - Input: { weight, measurements, photos, notes }

GET /api/client/progress
  - Get own progress history

GET /api/client/messages/:coach_id
  - Get messages with coach

POST /api/client/messages
  - Send message to coach
  - Input: { receiver_id, message }

POST /api/client/subscribe
  - Subscribe to plan
  - Input: { plan_type }
```

---

## Access Control Rules

### Frontend Route Protection

```javascript
// Example route configuration
const routes = {
  '/admin-dashboard': {
    requiredRole: 'super-admin',
    redirectTo: '/dashboard'
  },
  '/coach-dashboard': {
    requiredRole: 'coach',
    redirectTo: '/dashboard',
    requiresApproval: true
  },
  '/dashboard': {
    requiredRole: ['client', 'coach', 'super-admin'],
    redirectTo: '/login'
  }
}
```

### Role-Based Redirect Logic
```
User Login Successful
    ↓
Check user.role
    ↓
├─ super-admin → Redirect to /admin-dashboard
├─ coach + approved → Redirect to /coach-dashboard
├─ coach + NOT approved → Redirect to /coach-applications
├─ client → Redirect to /dashboard
└─ unknown → Redirect to /login + show error
```

### API Request Authorization

Every API request must include:
1. **Authentication**: Valid Supabase session
2. **Role**: User must have required role
3. **Ownership**: User must own the resource or be admin

```javascript
// Example middleware check
if (endpoint === '/api/coach/clients/:client_id') {
  // Check 1: User authenticated
  if (!user) throw new Error('Unauthorized');
  
  // Check 2: User is coach
  if (user.role !== 'coach') throw new Error('Forbidden');
  
  // Check 3: Coach owns this client
  const relationship = await db.query(
    'SELECT * FROM coach_clients WHERE coach_id = ? AND client_id = ?',
    [user.id, client_id]
  );
  if (!relationship) throw new Error('Forbidden');
}
```

---

## Security Implementation

### Row Level Security (RLS) Policies

#### Users Table
```sql
-- Users can only read their own data
CREATE POLICY users_read_own ON users FOR SELECT
  USING (auth.uid() = id);

-- Only super-admin can read all users
CREATE POLICY users_admin_read_all ON users FOR SELECT
  USING (role = 'super-admin' AND auth.uid() = id);

-- Users can only update their own data
CREATE POLICY users_update_own ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

#### Coach Clients Table
```sql
-- Coaches can only see their own clients
CREATE POLICY coach_clients_read ON coach_clients FOR SELECT
  USING (
    coach_id = auth.uid() OR
    client_id = auth.uid() OR
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );
```

#### Workout Plans Table
```sql
-- Users can only see their own plans
CREATE POLICY workout_plans_read ON workout_plans FOR SELECT
  USING (
    coach_id = auth.uid() OR
    client_id = auth.uid() OR
    EXISTS(SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super-admin')
  );
```

### Email Verification
```
Only "subodhmankala@gmail.com" can:
- Access admin dashboard
- View applications
- Approve/reject coaches
- Manage settings

This is enforced at:
1. Frontend: Route guards
2. Backend: API middleware
3. Database: RLS policies
```

### Session Security
```
- Session timeout: 24 hours
- Require re-authentication for sensitive operations
- Log all admin actions
- Use HTTPS only
- Secure cookies (HttpOnly, SameSite)
```

---

## Coach Approval Workflow

### Step 1: Application Submission
```
Coach clicks "Apply Now"
    ↓
Fills application form:
  - Certifications
  - Experience years
  - Specialization
  - Social media
  - Location
    ↓
Application created with status: "pending"
    ↓
Coach cannot access coach dashboard yet
```

### Step 2: Admin Review
```
Admin visits /admin-dashboard/applications
    ↓
Admin reviews pending applications
    ↓
Admin can:
  - View application details
  - Check coach profile
  - Add notes
  - Approve or Reject
```

### Step 3: Approval
```
Admin clicks "Approve"
    ↓
Actions:
  1. Update coach_applications.status = 'approved'
  2. Create coach_profile record
  3. Update users.role = 'coach'
  4. Set users.verified = true
  5. Create audit_log entry
  6. Send approval email to coach
    ↓
Coach Dashboard becomes accessible
```

### Step 4: Rejection
```
Admin clicks "Reject" + enters reason
    ↓
Actions:
  1. Update coach_applications.status = 'rejected'
  2. Store rejection_reason
  3. Create audit_log entry
  4. Send rejection email to user
    ↓
User can reapply after modification
```

---

## Implementation Checklist

- [ ] Create/Update database schema with all tables
- [ ] Enable Row Level Security on all tables
- [ ] Create RLS policies for each role
- [ ] Implement authentication flow
- [ ] Create API endpoints for each role
- [ ] Implement API middleware for authorization
- [ ] Create role-based redirect logic
- [ ] Implement frontend route guards
- [ ] Add audit logging for admin actions
- [ ] Create admin dashboard components
- [ ] Create application review interface
- [ ] Implement email notifications
- [ ] Add error handling and logging
- [ ] Set up environment variables
- [ ] Create admin documentation
- [ ] Test access control rules
- [ ] Test coach approval workflow
- [ ] Security audit and penetration testing

---

## Environment Variables

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPER_ADMIN_EMAIL=subodhmankala@gmail.com
```

