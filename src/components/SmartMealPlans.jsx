import React, { useState, useEffect } from 'react';
import './SmartMealPlans.css';

// ─────────────────────────────────────────────────────────────
//  VEGETARIAN MEAL PLAN
// ─────────────────────────────────────────────────────────────
const VEG_MEAL_PLAN = [
  {
    id: 'breakfast',
    mealType: 'Breakfast',
    icon: '🍳',
    time: '7:00 – 8:30 AM',
    tag: 'High Energy',
    tagColor: 'emerald',
    defaultMeal: {
      name: 'Poha with Peanuts',
      description: 'Light, gut-friendly, easy to digest. Provides steady energy without blood sugar crash.',
      ingredients: [
        { item: 'Flattened Rice (Poha)', amount: '80g dry', icon: '🌾' },
        { item: 'Roasted Peanuts', amount: '30g', icon: '🥜' },
        { item: 'Curry Leaves + Mustard', amount: '1 tsp', icon: '🌿' },
        { item: 'Green Chilli', amount: '1 small', icon: '🌶️' },
        { item: 'Coconut (grated)', amount: '10g', icon: '🥥' },
      ],
      macros: { protein: 14, carbs: 58, fats: 9, calories: 370 },
      tip: '💡 Add lemon juice before eating to enhance iron absorption.',
    },
    swapMeal: {
      name: 'Moong Dal Chilla',
      description: 'High protein, savory green moong pancakes. Great for satiety and muscle repair.',
      ingredients: [
        { item: 'Green Moong Dal (soaked)', amount: '100g', icon: '🫘' },
        { item: 'Onion + Tomato', amount: '50g', icon: '🧅' },
        { item: 'Ginger-Garlic Paste', amount: '1 tsp', icon: '🧄' },
        { item: 'Paneer (crumbled, filling)', amount: '40g', icon: '🧀' },
        { item: 'Ghee (for cooking)', amount: '5g (1 tsp)', icon: '🫙' },
      ],
      macros: { protein: 22, carbs: 38, fats: 8, calories: 315 },
      tip: '💡 Soak moong dal overnight for better digestion.',
    },
  },
  {
    id: 'lunch',
    mealType: 'Lunch',
    icon: '☀️',
    time: '12:30 – 2:00 PM',
    tag: 'Protein Rich',
    tagColor: 'blue',
    defaultMeal: {
      name: 'Paneer Butter Masala + 2 Roti',
      description: 'Rich in protein and healthy fats. Paneer is a complete vegetarian protein source.',
      ingredients: [
        { item: 'Paneer (cubed)', amount: '150g', icon: '🧀' },
        { item: 'Whole Wheat Roti', amount: '2 rotis (~60g each)', icon: '🫓' },
        { item: 'Tomato Gravy Base', amount: '100g purée', icon: '🍅' },
        { item: 'Onion', amount: '50g', icon: '🧅' },
        { item: 'Ghee / Butter', amount: '10g (2 tsp)', icon: '🫙' },
        { item: 'Cream (low fat)', amount: '20ml', icon: '🥛' },
      ],
      macros: { protein: 32, carbs: 65, fats: 18, calories: 550 },
      tip: '💡 Chew each bite 20–25 times for better gut digestion.',
    },
    swapMeal: {
      name: 'Tofu Stir Fry + Brown Rice',
      description: 'Dairy-free powerhouse. Excellent if paneer causes bloating or gas.',
      ingredients: [
        { item: 'Firm Tofu', amount: '180g', icon: '🫙' },
        { item: 'Brown Rice (cooked)', amount: '150g (¾ cup)', icon: '🍚' },
        { item: 'Bell Peppers + Onion', amount: '80g mixed', icon: '🫑' },
        { item: 'Soy Sauce (low sodium)', amount: '1 tbsp', icon: '🧂' },
        { item: 'Olive Oil', amount: '8g (2 tsp)', icon: '🫒' },
        { item: 'Garlic', amount: '3 cloves', icon: '🧄' },
      ],
      macros: { protein: 28, carbs: 58, fats: 12, calories: 460 },
      tip: '💡 Press tofu dry before cooking to improve texture and protein density.',
    },
  },
  {
    id: 'snack',
    mealType: 'Evening Snack',
    icon: '🌿',
    time: '4:30 – 5:30 PM',
    tag: 'Light Fuel',
    tagColor: 'amber',
    defaultMeal: {
      name: 'Greek Yoghurt with Fruits',
      description: 'Probiotic-rich snack supporting gut bacteria. Keeps hunger at bay before dinner.',
      ingredients: [
        { item: 'Greek Yoghurt (full fat)', amount: '150g', icon: '🥛' },
        { item: 'Mixed Berries / Banana', amount: '80g', icon: '🍓' },
        { item: 'Sunflower Seeds', amount: '10g', icon: '🌻' },
        { item: 'Honey (optional)', amount: '5g (1 tsp)', icon: '🍯' },
      ],
      macros: { protein: 15, carbs: 22, fats: 5, calories: 195 },
      tip: '💡 Eat 30 min before workout for peak performance energy.',
    },
    swapMeal: {
      name: 'Roasted Chana + Mixed Nuts',
      description: 'High fiber, high protein snack that stabilizes blood sugar between meals.',
      ingredients: [
        { item: 'Roasted Chana (chickpeas)', amount: '50g', icon: '🫘' },
        { item: 'Almonds', amount: '15g (10 pieces)', icon: '🫚' },
        { item: 'Walnuts', amount: '10g (3 pieces)', icon: '🥜' },
        { item: 'Black Raisins', amount: '15g', icon: '🍇' },
      ],
      macros: { protein: 13, carbs: 28, fats: 12, calories: 270 },
      tip: '💡 Walnuts contain omega-3s that reduce gut inflammation.',
    },
  },
  {
    id: 'dinner',
    mealType: 'Dinner',
    icon: '🌙',
    time: '7:30 – 8:30 PM',
    tag: 'Light & Lean',
    tagColor: 'purple',
    defaultMeal: {
      name: 'Dal Tadka + Steamed Rice',
      description: 'Easy to digest complete protein pairing. Dal + rice provides all essential amino acids.',
      ingredients: [
        { item: 'Yellow Toor Dal (raw)', amount: '80g', icon: '🫘' },
        { item: 'Basmati Rice (raw)', amount: '60g (¼ cup dry)', icon: '🍚' },
        { item: 'Ghee (tadka)', amount: '8g (2 tsp)', icon: '🫙' },
        { item: 'Cumin + Mustard Seeds', amount: '1 tsp each', icon: '🌿' },
        { item: 'Tomato + Garlic', amount: '40g', icon: '🍅' },
      ],
      macros: { protein: 22, carbs: 72, fats: 8, calories: 450 },
      tip: '💡 Eat dal rice at least 2 hrs before bedtime for full digestion cycle.',
    },
    swapMeal: {
      name: 'Palak Paneer + 1 Roti',
      description: 'Iron + protein powerhouse. Spinach aids overnight muscle recovery and reduces inflammation.',
      ingredients: [
        { item: 'Spinach (palak, blanched)', amount: '150g', icon: '🥬' },
        { item: 'Paneer (cubed)', amount: '100g', icon: '🧀' },
        { item: 'Whole Wheat Roti', amount: '1 roti (~60g)', icon: '🫓' },
        { item: 'Ghee', amount: '5g (1 tsp)', icon: '🫙' },
        { item: 'Onion + Tomato masala', amount: '60g', icon: '🧅' },
      ],
      macros: { protein: 26, carbs: 38, fats: 14, calories: 390 },
      tip: '💡 Spinach + paneer = iron + calcium synergy. Great for hormonal balance.',
    },
  },
];

// ─────────────────────────────────────────────────────────────
//  NON-VEGETARIAN MEAL PLAN
// ─────────────────────────────────────────────────────────────
const NONVEG_MEAL_PLAN = [
  {
    id: 'breakfast',
    mealType: 'Breakfast',
    icon: '🍳',
    time: '7:00 – 8:30 AM',
    tag: 'Protein Start',
    tagColor: 'emerald',
    defaultMeal: {
      name: 'Scrambled Eggs + Oats',
      description: 'High protein breakfast with complex carbs. Ideal combo for sustained energy all morning.',
      ingredients: [
        { item: 'Whole Eggs', amount: '3 eggs (~150g)', icon: '🥚' },
        { item: 'Rolled Oats (cooked)', amount: '60g dry', icon: '🌾' },
        { item: 'Milk (for oats)', amount: '150ml', icon: '🥛' },
        { item: 'Butter / Ghee (eggs)', amount: '5g (1 tsp)', icon: '🫙' },
        { item: 'Salt + Black Pepper', amount: 'to taste', icon: '🧂' },
      ],
      macros: { protein: 28, carbs: 42, fats: 16, calories: 425 },
      tip: '💡 Add spinach to scrambled eggs for a gut-healing micronutrient boost.',
    },
    swapMeal: {
      name: 'Egg White Omelette + Toast',
      description: 'High protein, low fat. Ideal for cutting phase or mornings before cardio.',
      ingredients: [
        { item: 'Egg Whites', amount: '4 whites (~140g)', icon: '🥚' },
        { item: 'Whole Wheat Toast', amount: '2 slices (~70g)', icon: '🍞' },
        { item: 'Capsicum + Onion', amount: '60g', icon: '🫑' },
        { item: 'Olive Oil (for pan)', amount: '5g (1 tsp)', icon: '🫒' },
      ],
      macros: { protein: 26, carbs: 36, fats: 8, calories: 320 },
      tip: '💡 Egg whites are ~92% pure protein — best pre-workout breakfast.',
    },
  },
  {
    id: 'lunch',
    mealType: 'Lunch',
    icon: '☀️',
    time: '12:30 – 2:00 PM',
    tag: 'Muscle Fuel',
    tagColor: 'blue',
    defaultMeal: {
      name: 'Chicken Breast Rice Bowl',
      description: 'The gold-standard fitness meal. Lean protein + slow carbs = anabolic recovery fuel.',
      ingredients: [
        { item: 'Chicken Breast (boneless)', amount: '200g raw', icon: '🍗' },
        { item: 'Basmati / Brown Rice (raw)', amount: '80g dry', icon: '🍚' },
        { item: 'Cucumber + Onion Salad', amount: '100g', icon: '🥒' },
        { item: 'Lemon Juice', amount: '1 tbsp', icon: '🍋' },
        { item: 'Olive Oil (for cooking)', amount: '8g (2 tsp)', icon: '🫒' },
        { item: 'Mixed Herbs + Garlic', amount: '1 tsp each', icon: '🌿' },
      ],
      macros: { protein: 48, carbs: 62, fats: 10, calories: 535 },
      tip: '💡 Eat within 60 min post-workout for maximum muscle protein synthesis.',
    },
    swapMeal: {
      name: 'Grilled Salmon + Sweet Potato',
      description: 'Omega-3 rich, anti-inflammatory. Sweet potato provides slow-burning carbs for recovery.',
      ingredients: [
        { item: 'Salmon Fillet', amount: '180g', icon: '🐟' },
        { item: 'Sweet Potato (baked)', amount: '150g', icon: '🍠' },
        { item: 'Broccoli (steamed)', amount: '100g', icon: '🥦' },
        { item: 'Olive Oil', amount: '10g (2 tsp)', icon: '🫒' },
        { item: 'Lemon + Herbs', amount: '1 tbsp', icon: '🍋' },
      ],
      macros: { protein: 42, carbs: 45, fats: 18, calories: 510 },
      tip: '💡 Salmon omega-3s reduce DOMS (muscle soreness) by up to 35%.',
    },
  },
  {
    id: 'snack',
    mealType: 'Evening Snack',
    icon: '🌿',
    time: '4:30 – 5:30 PM',
    tag: 'Recovery',
    tagColor: 'amber',
    defaultMeal: {
      name: 'Boiled Eggs + Greek Yoghurt',
      description: 'Complete protein snack with probiotics. Perfect pre-workout fuel combo.',
      ingredients: [
        { item: 'Whole Eggs (boiled)', amount: '2 eggs (~100g)', icon: '🥚' },
        { item: 'Greek Yoghurt (full fat)', amount: '120g', icon: '🥛' },
        { item: 'Mixed Berries', amount: '60g', icon: '🍓' },
        { item: 'Black Pepper', amount: 'to taste', icon: '🧂' },
      ],
      macros: { protein: 24, carbs: 14, fats: 12, calories: 265 },
      tip: '💡 Eat 45 min before training. Protein + healthy fat = sustained workout energy.',
    },
    swapMeal: {
      name: 'Tuna Salad Wrap',
      description: 'Lean, portable, high-protein snack. Great omega-3 top-up between meals.',
      ingredients: [
        { item: 'Canned Tuna (in water)', amount: '100g', icon: '🐟' },
        { item: 'Whole Wheat Wrap', amount: '1 wrap (~40g)', icon: '🫓' },
        { item: 'Lettuce + Tomato', amount: '50g', icon: '🥬' },
        { item: 'Low-fat Mayo / Mustard', amount: '10g (1 tbsp)', icon: '🧂' },
      ],
      macros: { protein: 28, carbs: 28, fats: 6, calories: 280 },
      tip: '💡 Tuna has 25g protein per 100g with near-zero fat. Ultra-lean.',
    },
  },
  {
    id: 'dinner',
    mealType: 'Dinner',
    icon: '🌙',
    time: '7:30 – 8:30 PM',
    tag: 'Lean Protein',
    tagColor: 'purple',
    defaultMeal: {
      name: 'Chicken Tikka + Mint Chutney',
      description: 'Lean protein with minimal carbs. Mint aids evening digestion. Light yet satisfying.',
      ingredients: [
        { item: 'Chicken Breast (boneless)', amount: '200g', icon: '🍗' },
        { item: 'Yoghurt (marinade)', amount: '50g', icon: '🥛' },
        { item: 'Lemon Juice', amount: '2 tbsp', icon: '🍋' },
        { item: 'Tandoori Masala', amount: '2 tsp', icon: '🌶️' },
        { item: 'Mint Chutney', amount: '30g', icon: '🌿' },
        { item: 'Olive Oil (brush)', amount: '5g (1 tsp)', icon: '🫒' },
      ],
      macros: { protein: 42, carbs: 8, fats: 8, calories: 278 },
      tip: '💡 High protein + low carb dinner = better fat metabolism overnight.',
    },
    swapMeal: {
      name: 'Grilled Fish Tikka + Salad',
      description: 'Omega-3 rich, lighter alternative. Very easy on the gut late at night.',
      ingredients: [
        { item: 'Rohu / Salmon Fillet', amount: '200g', icon: '🐟' },
        { item: 'Lemon + Garlic Marinade', amount: '2 tbsp', icon: '🍋' },
        { item: 'Mixed Greens', amount: '100g', icon: '🥬' },
        { item: 'Cucumber + Tomato', amount: '80g', icon: '🥒' },
        { item: 'Olive Oil (dressing)', amount: '8g (2 tsp)', icon: '🫒' },
      ],
      macros: { protein: 38, carbs: 6, fats: 12, calories: 285 },
      tip: '💡 Omega-3s in fish reduce gut inflammation. Best choice on bloating days.',
    },
  },
];

// ─────────────────────────────────────────────────────────────
//  COMPONENTS
// ─────────────────────────────────────────────────────────────
const MacroTag = ({ label, value, unit, color }) => (
  <div className={`macro-tag macro-${color}`}>
    <span className="macro-tag-value">{value}<span className="macro-tag-unit">{unit}</span></span>
    <span className="macro-tag-label">{label}</span>
  </div>
);

const MealCard = ({ data }) => {
  const [swapped, setSwapped] = useState(false);
  const current = swapped ? data.swapMeal : data.defaultMeal;
  const macros = current.macros;

  return (
    <div className="smp-card">
      {/* Card Header */}
      <div className="smp-card-header">
        <div className="smp-meal-identity">
          <span className="smp-meal-icon">{data.icon}</span>
          <div>
            <span className="smp-meal-type-label">{data.mealType}</span>
            <span className="smp-time-label">{data.time}</span>
          </div>
        </div>
        <span className={`smp-tag smp-tag-${data.tagColor} ${swapped ? 'smp-tag-swapped' : ''}`}>
          {swapped ? '🔄 Swapped' : data.tag}
        </span>
      </div>

      {/* Meal Name */}
      <h3 className="smp-meal-name">{current.name}</h3>

      {/* Macros Row */}
      <div className="smp-macros-row">
        <MacroTag label="Protein 🥩" value={macros.protein} unit="g" color="protein" />
        <MacroTag label="Carbs 🍚" value={macros.carbs} unit="g" color="carbs" />
        <MacroTag label="Fats 🥑" value={macros.fats} unit="g" color="fats" />
        <MacroTag label="Calories ⚡" value={macros.calories} unit="" color="cals" />
      </div>

      {/* Ingredients */}
      <div className="smp-ingredients">
        <span className="smp-section-label">📋 Exact Portions</span>
        <div className="smp-ingredients-grid">
          {current.ingredients.map((ing, i) => (
            <div key={i} className="smp-ingredient-chip">
              <span className="smp-ing-icon">{ing.icon}</span>
              <div className="smp-ing-text">
                <span className="smp-ing-name">{ing.item}</span>
                <span className="smp-ing-amount">{ing.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      <p className="smp-description">{current.description}</p>

      {/* Coach Tip */}
      <div className="smp-coach-tip">{current.tip}</div>

      {/* Swap Button */}
      <button
        className={`smp-swap-btn ${swapped ? 'smp-swap-btn-revert' : ''}`}
        onClick={() => setSwapped(prev => !prev)}
      >
        <span className="smp-swap-icon">{swapped ? '↩️' : '🔄'}</span>
        <span>{swapped ? 'Undo Swap → Back to Main' : 'Swap to Alternative Option'}</span>
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────
const SmartMealPlans = () => {
  const [diet, setDiet] = useState('Vegetarian');

  // ── User's actual targets from onboarding (same source as Home page) ──
  const [userTargets, setUserTargets] = useState({
    calories: 2000,
    protein: 130,
    carbs: 180,
    fats: 60
  });

  // ── Today's logged calories from the Home page meal tracker ──
  const [loggedCalories, setLoggedCalories] = useState(0);

  // ── Steps for burned calories (mirrors HomeTracker formula) ──
  const [steps, setSteps] = useState(() => {
    const storedSteps = localStorage.getItem('userSyncedSteps');
    if (storedSteps) return parseInt(storedSteps);
    const goal = localStorage.getItem('userGoal');
    if (goal === 'Fat Loss') return 5500;
    if (goal === 'Muscle Building') return 6000;
    return 4800; // Gut Fix / default
  });

  useEffect(() => {
    // Diet preference
    const stored = localStorage.getItem('userDiet');
    if (stored === 'Vegetarian' || stored === 'Non-Vegetarian') setDiet(stored);

    // Load user's personal targets (matches Home page Budget)
    const calTarget  = localStorage.getItem('userCalorieTarget');
    const protTarget = localStorage.getItem('userProteinTarget');
    const carbTarget = localStorage.getItem('userCarbsTarget');
    const fatTarget  = localStorage.getItem('userFatsTarget');

    setUserTargets({
      calories: calTarget  ? parseInt(calTarget)  : 2000,
      protein:  protTarget ? parseInt(protTarget) : 130,
      carbs:    carbTarget ? parseInt(carbTarget) : 180,
      fats:     fatTarget  ? parseInt(fatTarget)  : 60,
    });

    // Load today's logged calories from Home meal tracker
    const loadLogged = () => {
      const b = parseInt(localStorage.getItem('homeMealBreakfast') || '0');
      const l = parseInt(localStorage.getItem('homeMealLunch')     || '0');
      const d = parseInt(localStorage.getItem('homeMealDinner')    || '0');
      const s = parseInt(localStorage.getItem('homeMealSnacks')    || '0');
      const saved = localStorage.getItem('userLoggedCalories');
      // Use saved sum if available, otherwise compute from meal keys
      if (saved) {
        setLoggedCalories(parseInt(saved));
      } else if (localStorage.getItem('homeMealBreakfast') !== null) {
        setLoggedCalories(b + l + d + s);
      }
    };
    loadLogged();

    // ── Load steps to compute burned calories (same as HomeTracker) ──
    const loadSteps = () => {
      const storedSteps = localStorage.getItem('userSyncedSteps');
      if (storedSteps) {
        setSteps(parseInt(storedSteps));
      } else {
        const goal = localStorage.getItem('userGoal');
        if (goal === 'Fat Loss') setSteps(5500);
        else if (goal === 'Muscle Building') setSteps(6000);
        else setSteps(4800);
      }
    };
    loadSteps();

    // Keep in sync when Home page updates meals or steps
    window.addEventListener('nutritionUpdated', loadLogged);
    window.addEventListener('stepsUpdated', loadSteps);
    return () => {
      window.removeEventListener('nutritionUpdated', loadLogged);
      window.removeEventListener('stepsUpdated', loadSteps);
    };
  }, []);

  const handleDietToggle = (chosen) => {
    setDiet(chosen);
    localStorage.setItem('userDiet', chosen);
  };

  const isVeg = diet === 'Vegetarian';
  const MEAL_PLAN = isVeg ? VEG_MEAL_PLAN : NONVEG_MEAL_PLAN;

  // ── EXACT same formula as HomeTracker ──
  // Home:         remaining = budget - (eaten - burned)
  // SmartMealPlans: remaining = budget - (logged - burned)  ← now matches
  const caloriesBurned = Math.round(steps * 0.04);
  const netCalories = loggedCalories - caloriesBurned;
  const remainingCalories = userTargets.calories - netCalories;
  const progressPercent = Math.min((loggedCalories / userTargets.calories) * 100, 100);

  return (
    <div className="smp-container animate-slide-up">
      {/* Page Header */}
      <div className="screen-header smp-header">
        <span className="smp-header-eyebrow">🥗 Today's Plan</span>
        <h1 className="screen-title">Smart Plans</h1>
        <p className="screen-subtitle">Personalized gut-friendly menu with exact portions.</p>
      </div>

      {/* Diet Toggle */}
      <div className="smp-diet-toggle-wrapper">
        <div className="smp-diet-toggle">
          <button
            className={`smp-diet-btn ${isVeg ? 'active veg-active' : ''}`}
            onClick={() => handleDietToggle('Vegetarian')}
          >
            <span>🥦</span>
            <span>Vegetarian</span>
            <span className="diet-indicator veg-indicator"></span>
          </button>
          <button
            className={`smp-diet-btn ${!isVeg ? 'active nonveg-active' : ''}`}
            onClick={() => handleDietToggle('Non-Vegetarian')}
          >
            <span>🍗</span>
            <span>Non-Veg</span>
            <span className="diet-indicator nonveg-indicator"></span>
          </button>
        </div>
        <div className={`smp-diet-badge ${isVeg ? 'badge-veg' : 'badge-nonveg'}`}>
          {isVeg ? '🟢 Veg plan active' : '🔴 Non-veg plan active'}
        </div>
      </div>

      {/* Daily Targets Banner — matches Home page Budget exactly */}
      <div className="smp-daily-summary">
        <div className="smp-summary-top-row">
          <div className="smp-summary-label">Your Daily Targets</div>
          <div className="smp-calories-status">
            <span className="smp-eaten-label">
              <span className="smp-eaten-val">{loggedCalories}</span> eaten
            </span>
            <span className="smp-slash"> / </span>
            <span className="smp-budget-label">
              <span className="smp-budget-val cals-color">{userTargets.calories}</span> kcal budget
            </span>
          </div>
        </div>

        {/* Calorie Progress Bar */}
        <div className="smp-cal-progress-track">
          <div
            className={`smp-cal-progress-fill ${
              progressPercent >= 100 ? 'progress-done' : 'progress-active'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="smp-summary-macros">
          <div className="smp-summary-item">
            <span className="smp-summary-value protein-color">{userTargets.protein}g</span>
            <span className="smp-summary-key">Protein</span>
          </div>
          <div className="smp-summary-divider" />
          <div className="smp-summary-item">
            <span className="smp-summary-value carbs-color">{userTargets.carbs}g</span>
            <span className="smp-summary-key">Carbs</span>
          </div>
          <div className="smp-summary-divider" />
          <div className="smp-summary-item">
            <span className="smp-summary-value fats-color">{userTargets.fats}g</span>
            <span className="smp-summary-key">Fats</span>
          </div>
          <div className="smp-summary-divider" />
          <div className="smp-summary-item">
            <span className="smp-summary-value" style={{ color: remainingCalories >= 0 ? '#10b981' : '#f87171' }}>
              {Math.abs(remainingCalories)}
            </span>
            <span className="smp-summary-key">{remainingCalories >= 0 ? 'kcal left' : 'kcal over'}</span>
          </div>
        </div>

        <div className="smp-summary-note">
          {remainingCalories > 0
            ? `⚡ ${remainingCalories} kcal remaining to hit your daily budget`
            : remainingCalories === 0
            ? '🎯 Perfect! Daily calorie target achieved!'
            : `⚠️ ${Math.abs(remainingCalories)} kcal over today's budget`
          }
        </div>
      </div>

      {/* Meal Cards */}
      <div className="smp-meals-list">
        {MEAL_PLAN.map((meal) => (
          <MealCard key={`${diet}-${meal.id}`} data={meal} />
        ))}
      </div>

      {/* Footer */}
      <div className="smp-footer-note">
        <span>🌱</span>
        <p>Portions are calibrated to your profile. Swap buttons reveal equally nutritious alternatives with full macro breakdowns.</p>
      </div>
    </div>
  );
};

export default SmartMealPlans;
