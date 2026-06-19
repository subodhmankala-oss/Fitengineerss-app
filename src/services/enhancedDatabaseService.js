/**
 * Enhanced Database Service with RBAC
 * Integration with FitEngineers backend architecture
 * 
 * Extends the existing databaseService with role-based operations
 */

import { supabase, isSupabaseConfigured } from './databaseService';
import {
  isSuperAdmin,
  isApprovedCoach,
  canAccessAdmin,
  createAuditLog
} from './accessControl';

// ==========================================
// COACH APPLICATION OPERATIONS
// ==========================================

/**
 * Submit coach application
 */
export const submitCoachApplication = async (applicationData) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (!authUser) {
    throw new Error('User not authenticated');
  }

  try {
    const { data, error } = await supabase
      .from('coach_applications')
      .insert({
        user_id: authUser.id,
        status: 'pending',
        certifications: applicationData.certifications,
        experience_years: parseInt(applicationData.experience),
        specialization: applicationData.specialization,
        social_media_handle: applicationData.socialMedia,
        location: applicationData.location,
        submission_date: new Date()
      })
      .select();

    if (error) throw error;

    // Update user role to coach_pending
    const { error: roleError } = await supabase
      .from('users')
      .update({ role: 'coach' })
      .eq('id', authUser.id);

    if (roleError) throw roleError;

    return {
      success: true,
      applicationId: data[0].id,
      status: 'pending'
    };
  } catch (error) {
    console.error('Coach application submission error:', error);
    throw new Error(error.message || 'Failed to submit application');
  }
};


/**
 * Get coach applications (admin only)
 */
export const getCoachApplications = async (userEmail, filters = {}) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Verify user is super admin
  if (!isSuperAdmin(userEmail)) {
    throw new Error('Only super admin can view applications');
  }

  try {
    let query = supabase
      .from('coach_applications')
      .select('*, users(email, full_name)')
      .order('submission_date', { ascending: false });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get applications error:', error);
    throw new Error(error.message || 'Failed to fetch applications');
  }
};


/**
 * Approve coach application (admin only)
 */
export const approveCoachApplication = async (userEmail, applicationId, notes = '') => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Verify user is super admin
  if (!isSuperAdmin(userEmail)) {
    throw new Error('Only super admin can approve applications');
  }

  try {
    // Get application
    const { data: application, error: appError } = await supabase
      .from('coach_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError) throw appError;

    // Get current admin
    const { data: { user: adminUser } } = await supabase.auth.getUser();

    // Update application
    const { error: updateError } = await supabase
      .from('coach_applications')
      .update({
        status: 'approved',
        reviewed_at: new Date(),
        reviewed_by: adminUser.id,
        notes
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    // Create coach profile
    const { error: profileError } = await supabase
      .from('coach_profiles')
      .insert({
        user_id: application.user_id,
        certifications: application.certifications ? [application.certifications] : [],
        experience_years: application.experience_years,
        specialization: application.specialization,
        social_media_handle: application.social_media_handle,
        location: application.location,
        approved: true,
        approval_date: new Date(),
        approved_by: adminUser.id
      });

    if (profileError) {
      // Check if profile already exists
      if (!profileError.message.includes('duplicate')) {
        throw profileError;
      }
    }

    // Update user role and verified status
    const { error: userError } = await supabase
      .from('users')
      .update({
        role: 'coach',
        verified: true
      })
      .eq('id', application.user_id);

    if (userError) throw userError;

    // Create audit log
    if (adminUser) {
      await createAuditLog(
        supabase,
        adminUser.id,
        'approve_coach',
        'coach_application',
        applicationId,
        {
          coach_id: application.user_id,
          notes,
          approved_at: new Date()
        }
      );
    }

    return {
      success: true,
      message: 'Coach approved successfully',
      coachId: application.user_id
    };
  } catch (error) {
    console.error('Approve coach error:', error);
    throw new Error(error.message || 'Failed to approve coach');
  }
};


/**
 * Reject coach application (admin only)
 */
export const rejectCoachApplication = async (userEmail, applicationId, reason, notes = '') => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Verify user is super admin
  if (!isSuperAdmin(userEmail)) {
    throw new Error('Only super admin can reject applications');
  }

  try {
    // Get current admin
    const { data: { user: adminUser } } = await supabase.auth.getUser();

    // Update application
    const { error: updateError } = await supabase
      .from('coach_applications')
      .update({
        status: 'rejected',
        reviewed_at: new Date(),
        reviewed_by: adminUser.id,
        rejection_reason: reason,
        notes
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    // Create audit log
    if (adminUser) {
      await createAuditLog(
        supabase,
        adminUser.id,
        'reject_coach',
        'coach_application',
        applicationId,
        {
          reason,
          notes,
          rejected_at: new Date()
        }
      );
    }

    return {
      success: true,
      message: 'Coach application rejected'
    };
  } catch (error) {
    console.error('Reject coach error:', error);
    throw new Error(error.message || 'Failed to reject coach');
  }
};


// ==========================================
// COACH OPERATIONS
// ==========================================

/**
 * Create workout plan for client
 */
export const createWorkoutPlan = async (coachId, clientId, planData) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    // Verify coach owns client
    const { data: relationship } = await supabase
      .from('coach_clients')
      .select()
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .single();

    if (!relationship) {
      throw new Error('Coach does not manage this client');
    }

    // Create plan
    const { data, error } = await supabase
      .from('workout_plans')
      .insert({
        coach_id: coachId,
        client_id: clientId,
        plan_name: planData.plan_name,
        description: planData.description,
        exercises: planData.exercises || [],
        duration_weeks: planData.duration_weeks,
        difficulty_level: planData.difficulty_level,
        created_by: 'coach'
      })
      .select();

    if (error) throw error;

    return {
      success: true,
      planId: data[0].id,
      plan: data[0]
    };
  } catch (error) {
    console.error('Create workout plan error:', error);
    throw new Error(error.message || 'Failed to create workout plan');
  }
};


/**
 * Get coach's clients
 */
export const getCoachClients = async (coachId) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('coach_clients')
      .select(`
        *,
        client:users!client_id (
          id, email, full_name, 
          profile:user_profiles(weight_kg, age, fitness_goal)
        )
      `)
      .eq('coach_id', coachId)
      .eq('status', 'active');

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get coach clients error:', error);
    throw new Error(error.message || 'Failed to fetch clients');
  }
};


/**
 * Get client progress
 */
export const getClientProgress = async (clientId, coachId = null) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('progress_tracking')
      .select('*')
      .eq('user_id', clientId)
      .order('track_date', { ascending: false })
      .limit(30);

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get progress error:', error);
    throw new Error(error.message || 'Failed to fetch progress');
  }
};


// ==========================================
// CLIENT OPERATIONS
// ==========================================

/**
 * Get client's coaches
 */
export const getClientCoaches = async (clientId) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('coach_clients')
      .select(`
        *,
        coach:users!coach_id (
          id, email, full_name,
          profile:coach_profiles(specialization, rating)
        )
      `)
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get coaches error:', error);
    throw new Error(error.message || 'Failed to fetch coaches');
  }
};


/**
 * Update client progress
 */
export const updateClientProgress = async (clientId, progressData) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('progress_tracking')
      .insert({
        user_id: clientId,
        track_date: new Date().toISOString().split('T')[0],
        weight_kg: progressData.weight_kg,
        body_fat_percentage: progressData.body_fat_percentage,
        measurements: progressData.measurements,
        photos: progressData.photos || [],
        notes: progressData.notes
      })
      .select();

    if (error) throw error;

    return {
      success: true,
      progressId: data[0].id
    };
  } catch (error) {
    console.error('Update progress error:', error);
    throw new Error(error.message || 'Failed to update progress');
  }
};


/**
 * Log workout
 */
export const logWorkout = async (userId, planId, workoutData) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('workout_logs')
      .insert({
        user_id: userId,
        plan_id: planId,
        log_date: new Date().toISOString().split('T')[0],
        exercise_name: workoutData.exercise_name,
        sets: workoutData.sets || [],
        total_volume_kg: workoutData.total_volume_kg || 0,
        duration_minutes: workoutData.duration_minutes,
        notes: workoutData.notes
      })
      .select();

    if (error) throw error;

    return {
      success: true,
      logId: data[0].id
    };
  } catch (error) {
    console.error('Log workout error:', error);
    throw new Error(error.message || 'Failed to log workout');
  }
};


// ==========================================
// MESSAGING
// ==========================================

/**
 * Send message between coach and client
 */
export const sendMessage = async (senderId, receiverId, message, fileUrl = null) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        file_url: fileUrl,
        read: false
      })
      .select();

    if (error) throw error;

    return {
      success: true,
      messageId: data[0].id
    };
  } catch (error) {
    console.error('Send message error:', error);
    throw new Error(error.message || 'Failed to send message');
  }
};


/**
 * Get messages between two users
 */
export const getMessages = async (userId1, userId2) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),` +
        `and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      )
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get messages error:', error);
    throw new Error(error.message || 'Failed to fetch messages');
  }
};


// ==========================================
// ADMIN OPERATIONS
// ==========================================

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (userEmail, filters = {}) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Verify super admin
  if (!isSuperAdmin(userEmail)) {
    throw new Error('Only super admin can view all users');
  }

  try {
    let query = supabase
      .from('users')
      .select('*, profile:user_profiles(*)');

    if (filters.role) {
      query = query.eq('role', filters.role);
    }

    if (filters.verified !== undefined) {
      query = query.eq('verified', filters.verified);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get all users error:', error);
    throw new Error(error.message || 'Failed to fetch users');
  }
};


/**
 * Get audit logs (admin only)
 */
export const getAuditLogs = async (userEmail, filters = {}) => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured');
  }

  // Verify super admin
  if (!isSuperAdmin(userEmail)) {
    throw new Error('Only super admin can view audit logs');
  }

  try {
    let query = supabase
      .from('audit_logs')
      .select('*, admin:users(email, full_name)')
      .order('created_at', { ascending: false });

    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Get audit logs error:', error);
    throw new Error(error.message || 'Failed to fetch audit logs');
  }
};


// ==========================================
// EXPORT ALL FUNCTIONS
// ==========================================

export default {
  // Coach applications
  submitCoachApplication,
  getCoachApplications,
  approveCoachApplication,
  rejectCoachApplication,
  
  // Coach operations
  createWorkoutPlan,
  getCoachClients,
  getClientProgress,
  
  // Client operations
  getClientCoaches,
  updateClientProgress,
  logWorkout,
  
  // Messaging
  sendMessage,
  getMessages,
  
  // Admin operations
  getAllUsers,
  getAuditLogs
};
