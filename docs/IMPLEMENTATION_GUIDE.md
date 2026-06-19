# FitEngineers Backend Implementation Guide

## 🎯 Quick Start

This guide walks through implementing the FitEngineers backend with role-based access control, authentication, and the coach approval workflow.

## 📚 Documentation Files

1. **BACKEND_ARCHITECTURE.md** - Complete architecture overview
2. **API_ENDPOINTS.js** - All API endpoints with parameters
3. **accessControl.js** - Authorization utilities and checks
4. **supabase_schema_complete.sql** - Full database schema

## 🚀 Implementation Steps

### Step 1: Setup Supabase Database

```bash
# Copy the contents of supabase_schema_complete.sql
# Paste into Supabase SQL Editor
# Click "Run"
```

This creates:
- All required tables
- Row Level Security (RLS) policies
- Indexes for performance
- Foreign key relationships

### Step 2: Update Environment Variables

```env
# .env.local
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPER_ADMIN_EMAIL=subodhmankala@gmail.com
```

### Step 3: Import Access Control Utilities

```javascript
// In any component or service
import {
  isSuperAdmin,
  isApprovedCoach,
  canAccessAdmin,
  getDashboardURL,
  checkAuth
} from '@/services/accessControl';
```

### Step 4: Protect Frontend Routes

```javascript
// routeGuard.js
import { getDashboardURL, canAccessRoute } from '@/services/accessControl';

export const protectRoute = (user, routeRequirements) => {
  if (!user) {
    return '/login';
  }
  
  if (!canAccessRoute(user, routeRequirements)) {
    return getDashboardURL(user);
  }
  
  return null; // Route is accessible
};
```

### Step 5: Create Protected Components

```javascript
// Example: Admin Dashboard
import { canAccessAdmin } from '@/services/accessControl';

const AdminDashboard = ({ user }) => {
  if (!canAccessAdmin(user.email)) {
    return <div>Access Denied</div>;
  }
  
  return <div>Admin Dashboard Content</div>;
};
```

---

## 🔐 Authentication Flow

### User Logs In with Google

```javascript
// 1. User clicks "Sign In with Google"
const handleGoogleSignIn = async () => {
  // 2. Google auth completes
  const session = await supabase.auth.signInWithOAuth({ provider: 'google' });
  
  // 3. Fetch user profile
  const profile = await databaseService.getUserProfileByEmail(session.user.email);
  
  // 4. Determine role
  const userRole = profile?.role || 'client';
  
  // 5. Check approval if coach
  if (userRole === 'coach' && !profile.approved) {
    // Show application form
    redirectTo('/coach-applications');
  } else {
    // Show dashboard
    const dashboard = getDashboardURL(profile);
    redirectTo(dashboard);
  }
};
```

---

## 👥 Role-Based Access Control

### Super Admin (subodhmankala@gmail.com)

```javascript
// Check if user is super admin
if (isSuperAdmin(user.email)) {
  // Grant full access
  showAdminDashboard();
}

// Only this user can:
// - View all users
// - Approve/reject coaches
// - Access audit logs
// - Manage settings
```

### Coach (Approved)

```javascript
// Check if user is approved coach
if (isApprovedCoach(user)) {
  // Grant coach access
  showCoachDashboard();
}

// Coach can:
// - Manage own clients
// - Create workout plans
// - View client progress
// - Cannot see other coaches' clients
```

### Client

```javascript
// Check if user is client
if (isClient(user)) {
  // Grant client access
  showClientDashboard();
}

// Client can:
// - View own data
// - Update measurements
// - View assigned workouts
```

---

## 📋 Coach Application Workflow

### Step 1: User Submits Application

```javascript
// User fills form and submits
const submitApplication = async (formData) => {
  const { error } = await supabase
    .from('coach_applications')
    .insert({
      user_id: user.id,
      certifications: formData.certifications,
      experience_years: formData.experience,
      specialization: formData.specialization,
      social_media_handle: formData.social,
      location: formData.location,
      status: 'pending'
    });
  
  if (!error) {
    // Application submitted
    // User still sees application form
    setApplicationStatus('pending');
  }
};
```

### Step 2: Admin Reviews Application

```javascript
// Admin visits /admin-dashboard/applications
const AdminApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  
  useEffect(() => {
    // Fetch pending applications
    const fetchApplications = async () => {
      const { data } = await supabase
        .from('coach_applications')
        .select('*')
        .eq('status', 'pending');
      setApplications(data);
    };
    fetchApplications();
  }, []);
  
  return (
    <div>
      {applications.map(app => (
        <ApplicationCard key={app.id} application={app}>
          <button onClick={() => approveApplication(app.id)}>
            Approve
          </button>
          <button onClick={() => rejectApplication(app.id)}>
            Reject
          </button>
        </ApplicationCard>
      ))}
    </div>
  );
};
```

### Step 3: Admin Approves Application

```javascript
// Admin clicks "Approve"
const approveApplication = async (applicationId) => {
  try {
    // 1. Update application status
    const { data: app } = await supabase
      .from('coach_applications')
      .update({ status: 'approved', reviewed_at: new Date() })
      .eq('id', applicationId)
      .select();
    
    // 2. Create coach profile
    await supabase.from('coach_profiles').insert({
      user_id: app[0].user_id,
      certifications: app[0].certifications,
      experience_years: app[0].experience_years,
      specialization: app[0].specialization,
      approved: true,
      approval_date: new Date()
    });
    
    // 3. Update user role
    await supabase
      .from('users')
      .update({ role: 'coach', verified: true })
      .eq('id', app[0].user_id);
    
    // 4. Log audit entry
    await createAuditLog(
      supabase,
      adminId,
      'approve_coach',
      'coach',
      app[0].user_id,
      { reason: notes }
    );
    
    // 5. Send notification email
    await sendEmail({
      to: app[0].email,
      subject: 'Your Coach Application Approved!',
      template: 'coach_approved'
    });
    
    showSuccess('Coach approved successfully');
  } catch (error) {
    showError(error.message);
  }
};
```

### Step 4: Coach Accesses Dashboard

```javascript
// Now coach can access coach dashboard
// Next login will redirect to /coach-dashboard
// Coach can see "Coach Dashboard" button in navbar
```

---

## 🛡️ Protecting API Requests

### Example: Coach Creating Workout Plan

```javascript
// Backend API handler (Supabase Edge Function)
export async function POST(req) {
  try {
    // 1. Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 2. Check role
    if (user.role !== 'coach') {
      return new Response('Forbidden', { status: 403 });
    }
    
    // 3. Check approval
    if (!user.approved) {
      return new Response('Approval Required', { status: 403 });
    }
    
    // 4. Check ownership - is client actually their client?
    const { data: relationship } = await supabase
      .from('coach_clients')
      .select()
      .eq('coach_id', user.id)
      .eq('client_id', req.body.client_id)
      .single();
    
    if (!relationship) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // 5. Create workout plan
    const { data: plan, error } = await supabase
      .from('workout_plans')
      .insert({
        coach_id: user.id,
        client_id: req.body.client_id,
        plan_name: req.body.plan_name,
        exercises: req.body.exercises,
        duration_weeks: req.body.duration_weeks
      })
      .select();
    
    if (error) {
      return new Response(error.message, { status: 400 });
    }
    
    // 6. Log audit
    await createAuditLog(
      supabase,
      user.id,
      'create_workout_plan',
      'workout_plan',
      plan[0].id
    );
    
    return new Response(JSON.stringify(plan[0]), { status: 201 });
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
```

---

## 📊 Database Relationships

### Coach-Client Relationship

```
users (Coach)
  ↓
coach_clients (Relationship)
  ↓
users (Client)
```

```sql
-- Example query: Get coach's clients
SELECT 
  users.id, 
  users.email, 
  user_profiles.weight_kg,
  coach_clients.status
FROM coach_clients
JOIN users ON coach_clients.client_id = users.id
JOIN user_profiles ON users.id = user_profiles.user_id
WHERE coach_clients.coach_id = $1;
```

### Workout Plan Relationship

```
coach_clients (Relationship)
  ↓
workout_plans (Plan)
  ↓
workout_logs (Logged Sessions)
```

---

## ✅ Testing Checklist

- [ ] Super admin email hardcoded to subodhmankala@gmail.com
- [ ] Only super admin can view applications
- [ ] Only super admin can approve/reject coaches
- [ ] Coach cannot access admin dashboard
- [ ] Client cannot access coach dashboard
- [ ] Coach can only see their own clients
- [ ] Pending coaches cannot access coach dashboard
- [ ] Audit logs created for admin actions
- [ ] RLS policies blocking unauthorized data access
- [ ] Google auth flow working
- [ ] Role-based redirects working
- [ ] Email notifications sending

---

## 🐛 Troubleshooting

### Issue: User stuck on login

**Solution**: Check if role is set correctly in users table

```sql
SELECT * FROM users WHERE email = 'test@example.com';
```

### Issue: Coach cannot access dashboard

**Solution**: Check if approved = true in coach_profiles

```sql
SELECT * FROM coach_profiles WHERE user_id = (
  SELECT id FROM users WHERE email = 'coach@example.com'
);
```

### Issue: Admin cannot see applications

**Solution**: Verify email is subodhmankala@gmail.com

```javascript
if (user.email.toLowerCase() !== 'subodhmankala@gmail.com') {
  return 'Only super admin can view applications';
}
```

---

## 📞 Support

For questions about the backend architecture:
1. Review BACKEND_ARCHITECTURE.md
2. Check API_ENDPOINTS.js for endpoint details
3. Review accessControl.js for authorization checks
4. Check supabase_schema_complete.sql for database structure

---

## 🎓 Key Concepts

### Row Level Security (RLS)

Policies at the database level that prevent users from accessing unauthorized data.

```sql
-- Users can only read their own data
CREATE POLICY "Users can read their own data" ON users FOR SELECT
  USING (auth.uid() = id);
```

### Role-Based Access Control (RBAC)

Different user roles have different permissions:
- Super Admin: Full access
- Coach: Client management access
- Client: Own data access only

### Audit Logging

All admin actions are logged for compliance and security.

```javascript
await createAuditLog(
  supabase,
  adminId,
  'approve_coach',
  'coach',
  coachId
);
```

---

## 📝 Notes

- All email comparisons are case-insensitive
- Sessions persist using Supabase auth
- Timestamps are in UTC
- Soft deletes are used for data retention
- All sensitive actions are logged

