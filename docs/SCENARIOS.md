# FitEngineers Functional Scenarios & Workflows

This document maps out all functional scenarios, user flows, inputs, outputs, and system behaviors supported by the FitEngineers application.

---

## 1. Authentication & Session Management Scenarios

### Scenario 1.1: Client Account Creation (Signup)
- **Actor**: Guest / New Client
- **Preconditions**: User has a valid Google account or email.
- **Trigger**: User clicks "Sign In with Google" or fills out the email signup form.
- **Workflow**:
  1. User authenticates via Google OAuth or submits credentials.
  2. Google/Supabase returns authentication details (token, email, name).
  3. System checks the `users` table. If the email doesn't exist:
     - Creates a new record in `users` with role `client` and `verified = false`.
     - Directs user to the [Onboarding Wizard](#2-onboarding--personalization-scenarios).
- **Postconditions**: User is authenticated; a session is established in `localStorage` and Supabase Auth.

### Scenario 1.2: Returning User Login
- **Actor**: Registered Client, Coach, or Admin
- **Preconditions**: Account exists in the database.
- **Trigger**: User opens the app.
- **Workflow**:
  1. System checks for a valid session token in `localStorage` (via `supabase.auth.getSession()`).
  2. If a session exists, the system fetches the user profile from the database (`databaseService.getUserProfileByEmail(email)`).
  3. System reads the role and verification status from the profile and routes accordingly:
     - `super-admin` ➔ `/admin-dashboard` (Trainer/Admin UI)
     - `coach` (approved & verified) ➔ `/coach-dashboard` (Trainer/Admin UI)
     - `coach_pending` / unverified coach ➔ Displays a pulsing **"Application Under Review"** status screen.
     - `coach_rejected` ➔ Displays a soft-red **"Application Not Approved"** status screen with support contact link.
     - `client` (onboarding complete) ➔ `/dashboard` (Client UI)
     - `client` (onboarding incomplete) ➔ Onboarding stepper or locked invite code screen.
- **Postconditions**: The UI or status overlay matches the user's role and approval state.

### Scenario 1.3: Password Recovery & Reset
- **Actor**: Client or Coach using Email Credentials
- **Preconditions**: Forgotten password; user has a registered email.
- **Trigger**: User clicks "Forgot Password" on the login screen.
- **Workflow**:
  1. User enters their email address.
  2. Frontend calls `/api/auth/reset-password`, generating a secure token in `password_reset_tokens`.
  3. System triggers an email containing a link with the reset token (e.g., `/reset-password?token=XYZ`).
  4. User clicks the link, opens [ResetPasswordPage.jsx](file:///Users/mankalmr/Documents/Projects/Fitengineerss-app/src/components/ResetPasswordPage.jsx), validates the token, enters a new password, and submits.
  5. Database updates the password credentials and marks the token as used.
- **Postconditions**: Password is updated.

### Scenario 1.4: User Logout
- **Actor**: Authenticated User
- **Preconditions**: User is logged in.
- **Trigger**: User clicks "Logout" in the navigation/profile panel.
- **Workflow**:
  1. Frontend calls `databaseService.signOut()`, notifying Supabase to invalidate the token.
  2. Clears the local cache (`localStorage.clear()`), retaining only the `last_logged_in_email` and remembered credentials.
  3. Triggers PWA cache clearance (clears service worker registrations and Cache Storage).
  4. Forces a complete page reload to reset the application state.
- **Postconditions**: Session is destroyed, and the user is redirected to the login landing page.

---

## 2. Onboarding & Personalization Scenarios

The onboarding flow is managed by [Onboarding.jsx](file:///Users/mankalmr/Documents/Projects/Fitengineerss-app/src/components/Onboarding.jsx) to calculate starting physical baselines and goals.

```
[Step 0: Welcome / Auth] ➔ [Step 1: Contact Details] ➔ [Step 2: Physical Metrics] 
                                                                  │
[Step 6: Diet Preference] ➔ [Step 5: Gut/Health Issues] ➔ [Step 3 & 4: Goals/TDEE]
```

### Scenario 2.1: Welcome & Persona Select
- **Trigger**: Authenticated user with no profile record in `users` or `coaches`.
- **Workflow**:
  1. New users choose client or coach onboarding on the landing page.
  2. If they choose **Coach**, signing in via Google authenticates them and redirects them directly to the coach application form.
  3. If they choose **Client**, signing in via Google authenticates them and starts the client Onboarding Wizard.

### Scenario 2.2: Step 1 - Contact Details
- **Inputs**: Phone number.
- **Validation**: Verifies phone number format.
- **Workflow**: Links the contact details to the pending registration. Allows the user to jump to the final step if they are editing an existing profile.

### Scenario 2.3: Step 2 - Physical Metrics & BMR Calculation
- **Inputs**: Age (years), height (cm), weight (kg).
- **Validation**: Values must be positive numbers.
- **Calculations**:
  - Computes Basal Metabolic Rate (BMR) using the Harris-Benedict formula (approximated based on age, height, and weight metrics).

### Scenario 2.4: Step 3 - Activity Level & TDEE Calibration
- **Inputs**: Activity Level:
  - *Sedentary* (multiplier: 1.2)
  - *Lightly Active* (multiplier: 1.375)
  - *Moderately Active* (multiplier: 1.55)
  - *Very Active* (multiplier: 1.725)
- **Calculations**: Computes Total Daily Energy Expenditure (TDEE) as:
  $$\text{TDEE} = \text{BMR} \times \text{multiplier}$$

### Scenario 2.5: Step 4 - Goal Alignment & Intake Offsets
- **Inputs**: Fitness Goal:
  - *Fat Loss*: Applies a deficit (subtracts 300-500 kcal from TDEE).
  - *Muscle Gain*: Applies a surplus (adds 200-400 kcal to TDEE).
  - *Maintenance*: Maintains TDEE calorie level.

### Scenario 2.6: Step 5 & 6 - Gut Health, Dietary Preferences & Target Finalization
- **Inputs**:
  - Health/gut challenges (e.g., Bloating, Sleep deprivation, Joint pain, Stress).
  - Dietary preferences (e.g., Balanced, Vegetarian, Vegan, Keto, High-Protein).
- **Workflow**:
  1. Recalculates macronutrient thresholds:
     - **Protein target**: Calibrated based on weight (e.g., 1.8g to 2.2g per kg of body weight).
     - **Fat target**: Aligned to 20-30% of target calories.
     - **Carb target**: Fills remaining calorie targets.
  2. Saves the profile:
     - Inserts record into `users` and `clients` tables (or local storage partitions).
     - Initializes a 30-day `progress_history` table.
     - Sets `onboardingComplete = true` in browser cache.
- **Postconditions**: Directs the user to the active client dashboard.

---

## 3. Daily Tracking Scenarios (Client)

### Scenario 3.1: Hydration Log & Dynamic Target Adjustment
- **Trigger**: User taps the "+" or "-" buttons on the water cup tracker.
- **Calculations**:
  - Base target:
    $$\text{Baseline Glasses} = \frac{\frac{\text{Calorie Target}}{250} + \frac{\text{Weight (kg)} \times 35}{250}}{2}$$
  - Step Booster: Adds 1 glass of water for every 3,000 steps walked.
  - Protein Booster: Adds 1 glass of water if the protein target exceeds 100g.
- **Workflow**:
  1. System displays progress toward the dynamic target.
  2. Updates `localStorage` and triggers a background sync to the `tracker_logs` table in Supabase.
- **Postconditions**: Updated progress is displayed, and state is synchronized.

### Scenario 3.2: Step Count Logging & Goal Syncing
- **Trigger**: User inputs walked steps manually or syncs with a fitness tracker.
- **Workflow**:
  1. Updates the daily step log.
  2. Recalculates the water intake booster based on the updated step count.
  3. Syncs the logs to the database.

### Scenario 3.3: Food Calorie & Macronutrient Intake Logging
- **Trigger**: User logs food items under Breakfast, Lunch, Dinner, or Snacks.
- **Inputs**: Food name, calories, protein (g), carbs (g), fats (g).
- **Workflow**:
  1. Tally values are added to the daily intake total.
  2. System calculates remaining targets:
     - $\text{Calories Left} = \text{Target Calories} - \text{Logged Calories}$
     - $\text{Protein Left} = \text{Target Protein} - \text{Logged Protein}$
  3. Syncs current nutritional stats with the cloud.

### Scenario 3.4: Post-Meal Digestion Checks
- **Trigger**: User checks "Walk logged" after lunch or dinner.
- **Workflow**: Logs 10-minute post-meal walks to maintain metabolic rate and manage blood sugar.

### Scenario 3.5: Bloating & Gastrointestinal Logging
- **Trigger**: User logs gut comfort ratings on the bloating dashboard.
- **Inputs**: Bloating severity level (1 to 5), symptoms (e.g., gas, cramps), foods eaten prior to discomfort.
- **Workflow**: Logs gut discomfort data and correlates bloating events with food logs.

---

## 4. Nutrition & Meal Planning Scenarios

### Scenario 4.1: Accessing Custom Meal Plans
- **Trigger**: User clicks the "Nutrition/Meal" tab.
- **Workflow**: Fetches meal plans assigned by the coach (`meal_plans` table). Displays customized structures for breakfast, lunch, and dinner, along with target macros.

### Scenario 4.2: AI-Powered Meal Scanner
- **Trigger**: User snaps a photo of their plate or uploads an image.
- **Workflow**:
  1. Image is processed by the AI integration helper.
  2. AI estimates calories and macros (protein, fats, carbs) for the items on the plate.
  3. Displays estimated metrics for review.
  4. User approves and logs the values directly into the daily nutrition tracker.

---

## 5. Workout & Fitness Scenarios

### Scenario 5.1: Exercising & Routine Logs
- **Trigger**: User starts a workout session from the dashboard.
- **Workflow**:
  1. Fetches active workout routines assigned by the coach (`workout_plans` table).
  2. User selects an active routine (e.g., "Push Day").
  3. Displays the list of exercises, sets, reps, and target weights.

### Scenario 5.2: Set-by-Set Logging
- **Inputs**: Weight lifted, reps completed, and optional set notes.
- **Workflow**:
  1. As each set is checked off, the system calculates the volume:
     $$\text{Volume} = \text{Weight (kg)} \times \text{Reps}$$
  2. Tapping "Finish Workout" aggregates the totals and saves the session details to `workout_logs`.
- **Postconditions**: Session stats are logged, and the coach is notified.

---

## 6. Progress Analytics Scenarios

### Scenario 6.1: Progress Measurements Entry
- **Inputs**: Weight (kg), body fat (%), chest (cm), waist (cm), hips (cm), arms (cm), thighs (cm).
- **Workflow**: Writes the metrics to the `progress_tracking` database table.

### Scenario 6.2: Photo Comparison Logs
- **Trigger**: User uploads a front/side progress photo.
- **Workflow**: Saves the photo securely (Supabase Storage bucket) and logs the URL reference. Displays chronological timeline progress photos side-by-side.

### Scenario 6.3: Trend Visualizations (Charts)
- **Workflow**: Pulls the 30-day historical data from `progress_history` or local cache. Renders interactive trend line graphs plotting changes in weight, body measurements, and workout consistency.

---

## 7. Client-Coach Communication Scenarios

### Scenario 7.1: Real-Time Chat
- **Trigger**: Client or Coach opens the Chat tab and sends a message.
- **Inputs**: Message text, optional attachments (workout videos, meal screenshots).
- **Workflow**:
  1. Saves the message to `chat_messages`.
  2. If the recipient is online, the message displays in real-time.
  3. If offline, the unread count increases, and a push notification is triggered.

---

## 8. Coach (Trainer) Dashboard Scenarios

All coach operations are managed from the [TrainerDashboard.jsx](file:///Users/mankalmr/Documents/Projects/Fitengineerss-app/src/components/TrainerDashboard.jsx) view.

### Scenario 8.1: Client List & Compliance Overview
- **Workflow**: Loads active client records from the database. Shows an overview card for each client with step metrics, water compliance, and last login time.

### Scenario 8.2: Live Client Log Viewing
- **Workflow**: Coach selects a client to view their detailed dashboard. Shows their logged meals, weight metrics, bloating entries, and completed workouts.

### Scenario 8.3: Custom Workout Assignment
- **Workflow**: Coach opens the workouts panel, clicks "Create Workout Plan," enters exercises, sets, target reps, and weights, and assigns the plan to the client.

### Scenario 8.4: Nutrition Target Setup
- **Workflow**: Coach overrides calculated macros by entering custom values for daily calories, protein, carbs, and fats. The changes sync directly to the client's home screen.

---

## 9. Super Admin Dashboard Scenarios

All super-admin workflows are managed by [AdminDashboard.jsx](file:///Users/mankalmr/Documents/Projects/Fitengineerss-app/src/components/AdminDashboard.jsx).

### Scenario 9.1: Coach Application Review
- **Trigger**: Admin views pending coach submissions.
- **Workflow**:
  1. Admin inspects applicant profiles (credentials, certifications, locations).
  2. Admin clicks **Approve**:
     - Updates application status to `approved`.
     - Creates a record in the `coaches` table.
     - Promotes the user's role to `coach`.
     - Logs the action to `audit_logs` and sends an approval notification.
  3. Admin clicks **Reject**:
     - Promotes status to `rejected`, records the reason, and notifies the applicant.

### Scenario 9.2: User Accounts Directory
- **Workflow**: Fetches the user list. Allows the admin to view account statuses, check verified roles, soft-delete users, or restore accounts.

---

## 10. Push Notifications & Local Alerts

### Scenario 10.1: Background Alerts (Wake-up)
- **Workflow**: A background scheduler triggers reminders during active hours (8 AM to 10 PM):
  - **8 AM**: Morning motivation.
  - **1 PM & 8 PM**: Post-meal walks check-ins.
  - **10 PM**: Wind-down/recovery notification.
  - **Interval checks**: Prompts if water or protein intake lags behind daily targets.

### Scenario 10.2: Visibility-Triggered Reminders
- **Workflow**: When the user locks/unlocks their screen or switches browser tabs:
  - **Hide tab**: Triggers a reminder to stand up or take a break from active screen time.
  - **Show tab**: Triggers a prompt to log water intake or check posture.
