import { useState, useEffect } from 'react';
import databaseService, { isSuperAdmin, isSupabaseConfigured } from '../../../services/databaseService';

export function useTrainerData({ loggedInEmail, userRole, handleLogout }) {
  const superAdmin = isSuperAdmin(loggedInEmail) || userRole === 'super-admin' || userRole === 'admin';
  const [resolvedCoachId, setResolvedCoachId] = useState(() => localStorage.getItem('userId') || null);
  const [adminSubTab, setAdminSubTab] = useState('clients'); // 'clients' or 'coaches'
  const [coachesList, setCoachesList] = useState([]);
  const [pendingCoachesList, setPendingCoachesList] = useState([]);
  const [platformStats, setPlatformStats] = useState({ totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [selectedCoachDetails, setSelectedCoachDetails] = useState(null);
  const [refreshToast, setRefreshToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allUsersList, setAllUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [goalFilter, setGoalFilter] = useState('All');

  // Platform Admin: drill-down into a specific coach's actual client list
  const [drilldownCoach, setDrilldownCoach] = useState(null);
  const [drilldownClients, setDrilldownClients] = useState([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  const fetchAdminData = async () => {
    if (!superAdmin) return;
    setLoadingAdmin(true);
    try {
      const coaches = await databaseService.getAllCoaches();
      const stats = await databaseService.getPlatformStats();
      const pendingCoaches = await databaseService.getPendingCoachApplications();
      const exercises = await databaseService.getExerciseLibrary();
      setCoachesList(coaches || []);
      setPendingCoachesList(pendingCoaches || []);
      setPlatformStats(stats || { totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 });
      setExerciseCount(exercises ? exercises.length : 0);

      // Fetch all users for platform directory
      setLoadingUsers(true);
      const allUsers = await databaseService.getAllUsersWithRoles();
      setAllUsersList(allUsers || []);
      setLoadingUsers(false);
    } catch (e) {
      console.error('Error fetching admin data:', e);
      setLoadingUsers(false);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleViewCoachClients = async (coach) => {
    setDrilldownCoach(coach);
    setLoadingDrilldown(true);
    try {
      const coachClients = await databaseService.getClientsForCoach(coach.id);
      setDrilldownClients(coachClients || []);
    } catch (e) {
      console.error('Error fetching clients for coach:', e);
      setDrilldownClients([]);
    } finally {
      setLoadingDrilldown(false);
    }
  };

  const handleToggleCoachBlock = async (coach) => {
    const blocking = !coach.isBlocked;
    if (!window.confirm(
      blocking
        ? `Block ${coach.name || coach.email}? They will be signed out and unable to log in until unblocked.`
        : `Unblock ${coach.name || coach.email}? They will regain access on next login.`
    )) {
      return;
    }
    try {
      await databaseService.setCoachBlocked(coach.id, blocking);
      await fetchAdminData();
    } catch (err) {
      console.error('Error toggling coach block:', err);
      alert(err.message || 'Failed to update coach access.');
    }
  };

  const handleRejectCoach = async (coach) => {
    if (!window.confirm(`Reject ${coach.name || coach.email}'s application?`)) {
      return;
    }
    try {
      await databaseService.rejectCoach(coach.email);
      fetchAdminData();
      alert('Coach application rejected.');
    } catch (err) {
      console.error('Error rejecting coach:', err);
      alert('Failed to reject coach.');
    }
  };

  const handleRefresh = async () => {
    if (!superAdmin) return;
    setRefreshing(true);
    setRefreshToast('Refreshing coach profiles from cloud...');
    try {
      await databaseService.refreshLocalCoaches();
      await fetchAdminData();
      setRefreshToast('Profiles updated successfully.');
      setTimeout(() => setRefreshToast(''), 3000);
    } catch (err) {
      console.error('Refresh error:', err);
      setRefreshToast('Refresh failed.');
      setTimeout(() => setRefreshToast(''), 3000);
    } finally {
      setRefreshing(false);
    }
  };

  // Resolve Coach ID on mount
  useEffect(() => {
    let cancelled = false;
    databaseService.resolveUserId().then(id => {
      if (!cancelled && id) setResolvedCoachId(id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch all clients & workout summary on mount and configure real-time subscription
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const data = await databaseService.getAllUsers();
        const filteredData = data.filter(u => 
          u.email !== 'trainer@fitengineers.com' && 
          !isSuperAdmin(u.email) && 
          u.email !== 'coach@fitengineers.com'
        );
        setClients(filteredData);
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };

    const fetchSummary = async () => {
      try {
        const summary = await databaseService.getWorkoutSummaryForCoach();
        setWorkoutSummary(summary || []);
      } catch (err) {
        console.error('Error fetching workout summary:', err);
      } finally {
        setLoadingSummary(false);
      }
    };

    setLoadingClients(true);
    setLoadingSummary(true);
    fetchClients();
    fetchSummary();

    let channel = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      console.log('[DEBUG] Trainer Dashboard Context: Subscribing to real-time client, user, and workout_logs updates...');
      channel = databaseService.supabase
        .channel('trainer-context-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
          fetchClients();
          fetchSummary();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          fetchClients();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, () => {
          fetchSummary();
        })
        .subscribe();
    }

    return () => {
      if (channel && databaseService.supabase) {
        databaseService.supabase.removeChannel(channel);
      }
    };
  }, []);

  return {
    superAdmin,
    resolvedCoachId,
    setResolvedCoachId,
    adminSubTab,
    setAdminSubTab,
    coachesList,
    setCoachesList,
    pendingCoachesList,
    setPendingCoachesList,
    platformStats,
    setPlatformStats,
    loadingAdmin,
    setLoadingAdmin,
    exerciseCount,
    setExerciseCount,
    selectedCoachDetails,
    setSelectedCoachDetails,
    refreshToast,
    setRefreshToast,
    refreshing,
    setRefreshing,
    allUsersList,
    setAllUsersList,
    loadingUsers,
    setLoadingUsers,
    clients,
    setClients,
    loadingClients,
    setLoadingClients,
    workoutSummary,
    setWorkoutSummary,
    loadingSummary,
    setLoadingSummary,
    goalFilter,
    setGoalFilter,
    drilldownCoach,
    setDrilldownCoach,
    drilldownClients,
    setDrilldownClients,
    loadingDrilldown,
    setLoadingDrilldown,
    fetchAdminData,
    handleViewCoachClients,
    handleToggleCoachBlock,
    handleRejectCoach,
    handleRefresh,
    handleLogout
  };
}
