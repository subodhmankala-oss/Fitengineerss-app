import React, { useState, useEffect } from 'react';
import './SmartMealPlans.css';

// ─────────────────────────────────────────────────────────────
//  NUTRITIONAL RATIO DISTRIBUTION CONSTANTS
// ─────────────────────────────────────────────────────────────
const MEAL_RATIOS = {
  breakfast: { calories: 0.28, protein: 0.25, carbs: 0.35, fats: 0.25 },
  lunch:     { calories: 0.35, protein: 0.35, carbs: 0.35, fats: 0.30 },
  snack:     { calories: 0.15, protein: 0.15, carbs: 0.15, fats: 0.20 },
  dinner:    { calories: 0.22, protein: 0.25, carbs: 0.15, fats: 0.25 }
};

// Returns exact, mathematically balanced macros for a given meal
const getDistributedMacros = (mealId, userTargets) => {
  if (mealId === 'dinner') {
    const b = getDistributedMacros('breakfast', userTargets);
    const l = getDistributedMacros('lunch', userTargets);
    const s = getDistributedMacros('snack', userTargets);
    
    return {
      calories: Math.max(0, userTargets.calories - b.calories - l.calories - s.calories),
      protein:  Math.max(0, userTargets.protein - b.protein - l.protein - s.protein),
      carbs:    Math.max(0, userTargets.carbs - b.carbs - l.carbs - s.carbs),
      fats:     Math.max(0, userTargets.fats - b.fats - l.fats - s.fats),
    };
  }
  
  const ratio = MEAL_RATIOS[mealId];
  return {
    calories: Math.round(userTargets.calories * ratio.calories),
    protein:  Math.round(userTargets.protein * ratio.protein),
    carbs:    Math.round(userTargets.carbs * ratio.carbs),
    fats:     Math.round(userTargets.fats * ratio.fats),
  };
};

// ─────────────────────────────────────────────────────────────
//  VEGETARIAN BASE MEAL PLAN (PORTIONS AUTO-SCALE TO TARGETS)
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
        { item: 'Flattened Rice (Poha)', baseAmount: 80, unit: 'g dry', icon: '🌾' },
        { item: 'Roasted Peanuts', baseAmount: 30, unit: 'g', icon: '🥜' },
        { item: 'Coconut (grated)', baseAmount: 10, unit: 'g', icon: '🥥' },
        { item: 'Curry Leaves + Mustard', amount: '1 tsp', icon: '🌿' },
        { item: 'Green Chilli', amount: '1 small', icon: '🌶️' },
      ],
      macros: { calories: 370 }, // Base reference for scaling
      tip: '💡 Add lemon juice before eating to enhance iron absorption.',
    },
    swapMeal: {
      name: 'Moong Dal Chilla',
      description: 'High protein, savory green moong pancakes. Great for satiety and muscle repair.',
      ingredients: [
        { item: 'Green Moong Dal (soaked)', baseAmount: 100, unit: 'g', icon: '🫘' },
        { item: 'Paneer (crumbled filling)', baseAmount: 40, unit: 'g', icon: '🧀' },
        { item: 'Ghee (for cooking)', baseAmount: 5, unit: 'g (1 tsp)', icon: '🫙' },
        { item: 'Onion + Tomato', amount: '50g', icon: '🧅' },
        { item: 'Ginger-Garlic Paste', amount: '1 tsp', icon: '🧄' },
      ],
      macros: { calories: 315 },
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
        { item: 'Paneer (cubed)', baseAmount: 150, unit: 'g', icon: '🧀' },
        { item: 'Whole Wheat Roti', baseAmount: 2, unit: ' rotis', icon: '🫓' },
        { item: 'Ghee / Butter', baseAmount: 10, unit: 'g (2 tsp)', icon: '🫙' },
        { item: 'Cream (low fat)', baseAmount: 20, unit: 'ml', icon: '🥛' },
        { item: 'Tomato Gravy Base', amount: '100g purée', icon: '🍅' },
        { item: 'Onion', amount: '50g', icon: '🧅' },
      ],
      macros: { calories: 550 },
      tip: '💡 Chew each bite 20–25 times for better gut digestion.',
    },
    swapMeal: {
      name: 'Tofu Stir Fry + Brown Rice',
      description: 'Dairy-free powerhouse. Excellent if paneer causes bloating or gas.',
      ingredients: [
        { item: 'Firm Tofu', baseAmount: 180, unit: 'g', icon: '🫙' },
        { item: 'Brown Rice (cooked)', baseAmount: 150, unit: 'g (¾ cup)', icon: '🍚' },
        { item: 'Olive Oil', baseAmount: 8, unit: 'g (2 tsp)', icon: '🫒' },
        { item: 'Bell Peppers + Onion', amount: '80g mixed', icon: '🫑' },
        { item: 'Soy Sauce (low sodium)', amount: '1 tbsp', icon: '🧂' },
        { item: 'Garlic', amount: '3 cloves', icon: '🧄' },
      ],
      macros: { calories: 460 },
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
        { item: 'Greek Yoghurt (full fat)', baseAmount: 150, unit: 'g', icon: '🥛' },
        { item: 'Mixed Berries / Banana', baseAmount: 80, unit: 'g', icon: '🍓' },
        { item: 'Sunflower Seeds', baseAmount: 10, unit: 'g', icon: '🌻' },
        { item: 'Honey (optional)', baseAmount: 5, unit: 'g (1 tsp)', icon: '🍯' },
      ],
      macros: { calories: 195 },
      tip: '💡 Eat 30 min before workout for peak performance energy.',
    },
    swapMeal: {
      name: 'Roasted Chana + Mixed Nuts',
      description: 'High fiber, high protein snack that stabilizes blood sugar between meals.',
      ingredients: [
        { item: 'Roasted Chana', baseAmount: 50, unit: 'g', icon: '🫘' },
        { item: 'Almonds', baseAmount: 15, unit: 'g (10 pcs)', icon: '🫚' },
        { item: 'Walnuts', baseAmount: 10, unit: 'g (3 pcs)', icon: '🥜' },
        { item: 'Black Raisins', amount: '15g', icon: '🍇' },
      ],
      macros: { calories: 270 },
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
        { item: 'Yellow Toor Dal (raw)', baseAmount: 80, unit: 'g', icon: '🫘' },
        { item: 'Basmati Rice (raw)', baseAmount: 60, unit: 'g dry', icon: '🍚' },
        { item: 'Ghee (tadka)', baseAmount: 8, unit: 'g (2 tsp)', icon: '🫙' },
        { item: 'Cumin + Mustard Seeds', amount: '1 tsp each', icon: '🌿' },
        { item: 'Tomato + Garlic', amount: '40g', icon: '🍅' },
      ],
      macros: { calories: 450 },
      tip: '💡 Eat dal rice at least 2 hrs before bedtime for full digestion cycle.',
    },
    swapMeal: {
      name: 'Palak Paneer + 1 Roti',
      description: 'Iron + protein powerhouse. Spinach aids overnight muscle recovery and reduces inflammation.',
      ingredients: [
        { item: 'Spinach (blanched)', baseAmount: 150, unit: 'g', icon: '🥬' },
        { item: 'Paneer (cubed)', baseAmount: 100, unit: 'g', icon: '🧀' },
        { item: 'Whole Wheat Roti', baseAmount: 1, unit: ' roti', icon: '🫓' },
        { item: 'Ghee', baseAmount: 5, unit: 'g (1 tsp)', icon: '🫙' },
        { item: 'Onion + Tomato masala', amount: '60g', icon: '🧅' },
      ],
      macros: { calories: 390 },
      tip: '💡 Spinach + paneer = iron + calcium synergy. Great for hormonal balance.',
    },
  },
];

// ─────────────────────────────────────────────────────────────
//  NON-VEGETARIAN BASE MEAL PLAN (PORTIONS AUTO-SCALE TO TARGETS)
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
        { item: 'Whole Eggs', baseAmount: 3, unit: ' eggs (~150g)', icon: '🥚' },
        { item: 'Rolled Oats (cooked)', baseAmount: 60, unit: 'g dry', icon: '🌾' },
        { item: 'Milk (for oats)', baseAmount: 150, unit: 'ml', icon: '🥛' },
        { item: 'Butter / Ghee (eggs)', baseAmount: 5, unit: 'g (1 tsp)', icon: '🫙' },
        { item: 'Salt + Black Pepper', amount: 'to taste', icon: '🧂' },
      ],
      macros: { calories: 425 },
      tip: '💡 Add spinach to scrambled eggs for a gut-healing micronutrient boost.',
    },
    swapMeal: {
      name: 'Egg White Omelette + Toast',
      description: 'High protein, low fat. Ideal for cutting phase or mornings before cardio.',
      ingredients: [
        { item: 'Egg Whites', baseAmount: 4, unit: ' whites (~140g)', icon: '🥚' },
        { item: 'Whole Wheat Toast', baseAmount: 2, unit: ' slices (~70g)', icon: '🍞' },
        { item: 'Olive Oil (for pan)', baseAmount: 5, unit: 'g (1 tsp)', icon: '🫒' },
        { item: 'Capsicum + Onion', amount: '60g', icon: '𫛛' },
      ],
      macros: { calories: 320 },
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
        { item: 'Chicken Breast (boneless)', baseAmount: 200, unit: 'g raw', icon: '🍗' },
        { item: 'Basmati / Brown Rice (raw)', baseAmount: 80, unit: 'g dry', icon: '🍚' },
        { item: 'Olive Oil (for cooking)', baseAmount: 8, unit: 'g (2 tsp)', icon: '🫒' },
        { item: 'Cucumber + Onion Salad', amount: '100g', icon: '🥒' },
        { item: 'Lemon Juice', amount: '1 tbsp', icon: '🍋' },
        { item: 'Mixed Herbs + Garlic', amount: '1 tsp each', icon: '🌿' },
      ],
      macros: { calories: 535 },
      tip: '💡 Eat within 60 min post-workout for maximum muscle protein synthesis.',
    },
    swapMeal: {
      name: 'Grilled Salmon + Sweet Potato',
      description: 'Omega-3 rich, anti-inflammatory. Sweet potato provides slow-burning carbs for recovery.',
      ingredients: [
        { item: 'Salmon Fillet', baseAmount: 180, unit: 'g', icon: '🐟' },
        { item: 'Sweet Potato (baked)', baseAmount: 150, unit: 'g', icon: '🍠' },
        { item: 'Olive Oil', baseAmount: 10, unit: 'g (2 tsp)', icon: '🫒' },
        { item: 'Broccoli (steamed)', amount: '100g', icon: '🥦' },
        { item: 'Lemon + Herbs', amount: '1 tbsp', icon: '🍋' },
      ],
      macros: { calories: 510 },
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
        { item: 'Whole Eggs (boiled)', baseAmount: 2, unit: ' eggs (~100g)', icon: '🥚' },
        { item: 'Greek Yoghurt (full fat)', baseAmount: 120, unit: 'g', icon: '🥛' },
        { item: 'Mixed Berries', baseAmount: 60, unit: 'g', icon: '🍓' },
        { item: 'Black Pepper', amount: 'to taste', icon: '🧂' },
      ],
      macros: { calories: 265 },
      tip: '💡 Eat 45 min before training. Protein + healthy fat = sustained workout energy.',
    },
    swapMeal: {
      name: 'Tuna Salad Wrap',
      description: 'Lean, portable, high-protein snack. Great omega-3 top-up between meals.',
      ingredients: [
        { item: 'Canned Tuna (in water)', baseAmount: 100, unit: 'g', icon: '🐟' },
        { item: 'Whole Wheat Wrap', baseAmount: 1, unit: ' wrap (~40g)', icon: '🫓' },
        { item: 'Low-fat Mayo / Mustard', baseAmount: 10, unit: 'g (1 tbsp)', icon: '🧂' },
        { item: 'Lettuce + Tomato', amount: '50g', icon: '🥬' },
      ],
      macros: { calories: 280 },
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
        { item: 'Chicken Breast (boneless)', baseAmount: 200, unit: 'g', icon: '🍗' },
        { item: 'Yoghurt (marinade)', baseAmount: 50, unit: 'g', icon: '🥛' },
        { item: 'Olive Oil (brush)', baseAmount: 5, unit: 'g (1 tsp)', icon: '🫒' },
        { item: 'Lemon Juice', amount: '2 tbsp', icon: '🍋' },
        { item: 'Tandoori Masala', amount: '2 tsp', icon: '🌶️' },
        { item: 'Mint Chutney', amount: '30g', icon: '🌿' },
      ],
      macros: { calories: 278 },
      tip: '💡 High protein + low carb dinner = better fat metabolism overnight.',
    },
    swapMeal: {
      name: 'Grilled Fish Tikka + Salad',
      description: 'Omega-3 rich, lighter alternative. Very easy on the gut late at night.',
      ingredients: [
        { item: 'Salmon Fillet', baseAmount: 200, unit: 'g', icon: '🐟' },
        { item: 'Olive Oil (dressing)', baseAmount: 8, unit: 'g (2 tsp)', icon: '🫒' },
        { item: 'Lemon + Garlic Marinade', amount: '2 tbsp', icon: '🍋' },
        { item: 'Mixed Greens', amount: '100g', icon: '🥬' },
        { item: 'Cucumber + Tomato', amount: '80g', icon: '🥒' },
      ],
      macros: { calories: 285 },
      tip: '💡 Omega-3s in fish reduce gut inflammation. Best choice on bloating days.',
    },
  },
];

// ─────────────────────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────
const MacroTag = ({ label, value, unit, color }) => (
  <div className={`macro-tag macro-${color}`}>
    <span className="macro-tag-value">{value}<span className="macro-tag-unit">{unit}</span></span>
    <span className="macro-tag-label">{label}</span>
  </div>
);

const MealCard = ({ data, userTargets }) => {
  const [swapped, setSwapped] = useState(false);
  const current = swapped ? data.swapMeal : data.defaultMeal;
  
  // Calculate dynamic custom macros for this specific meal
  const dynamicMacros = getDistributedMacros(data.id, userTargets);
  
  // Calculate scaling factor relative to the base calories of the selected option
  const baseCalories = current.macros.calories;
  const scaleFactor = dynamicMacros.calories / baseCalories;

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

      {/* Dynamic Balanced Macros Row */}
      <div className="smp-macros-row">
        <MacroTag label="Protein 🥩" value={dynamicMacros.protein} unit="g" color="protein" />
        <MacroTag label="Carbs 🍚" value={dynamicMacros.carbs} unit="g" color="carbs" />
        <MacroTag label="Fats 🥑" value={dynamicMacros.fats} unit="g" color="fats" />
        <MacroTag label="Calories ⚡" value={dynamicMacros.calories} unit="" color="cals" />
      </div>

      {/* Scaled Ingredients */}
      <div className="smp-ingredients">
        <span className="smp-section-label">📋 Exact Portions</span>
        <div className="smp-ingredients-grid">
          {current.ingredients.map((ing, i) => {
            const displayAmount = ing.baseAmount 
              ? `${Math.round(ing.baseAmount * scaleFactor)}${ing.unit}`
              : ing.amount || ing.amountText;
            
            return (
              <div key={i} className="smp-ingredient-chip">
                <span className="smp-ing-icon">{ing.icon}</span>
                <div className="smp-ing-text">
                  <span className="smp-ing-name">{ing.item}</span>
                  <span className="smp-ing-amount">{displayAmount}</span>
                </div>
              </div>
            );
          })}
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

  // User's actual targets from onboarding (same source as Home page)
  const [userTargets, setUserTargets] = useState(() => {
    const goal = localStorage.getItem('userGoal');
    if (goal === 'Fat Loss') return { calories: 1300, protein: 100, carbs: 120, fats: 45 };
    if (goal === 'Muscle Building') return { calories: 2500, protein: 150, carbs: 280, fats: 80 };
    return { calories: 1800, protein: 130, carbs: 180, fats: 60 }; // Gut Fix / default
  });

  // Today's logged calories from the Home page meal tracker
  const [loggedCalories, setLoggedCalories] = useState(0);

  // Steps for burned calories (mirrors HomeTracker formula)
  const [steps, setSteps] = useState(() => {
    const storedSteps = localStorage.getItem('userSyncedSteps');
    if (storedSteps) return parseInt(storedSteps);
    return 0; // Default to 0 to match HomeTracker exactly
  });

  useEffect(() => {
    // Diet preference
    const stored = localStorage.getItem('userDiet');
    if (stored === 'Vegetarian' || stored === 'Non-Vegetarian') setDiet(stored);

    // Load user's personal targets (matches Home page Budget exactly)
    const calTarget  = localStorage.getItem('userCalorieTarget');
    const goal       = localStorage.getItem('userGoal');

    let fallback = { calories: 1800, protein: 130, carbs: 180, fats: 60 };
    if (goal === 'Fat Loss') {
      fallback = { calories: 1300, protein: 100, carbs: 120, fats: 45 };
    } else if (goal === 'Muscle Building') {
      fallback = { calories: 2500, protein: 150, carbs: 280, fats: 80 };
    }

    const calTargetNum = calTarget ? parseInt(calTarget) : fallback.calories;
    const balanced = balanceMacroTargets(calTargetNum, goal);

    // Save back to localStorage permanently so all other pages match instantly
    localStorage.setItem('userProteinTarget', balanced.protein.toString());
    localStorage.setItem('userCarbsTarget', balanced.carbs.toString());
    localStorage.setItem('userFatsTarget', balanced.fats.toString());

    setUserTargets({
      calories: calTargetNum,
      protein:  balanced.protein,
      carbs:    balanced.carbs,
      fats:     balanced.fats,
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

    // Load steps to compute burned calories (same as HomeTracker)
    const loadSteps = () => {
      const storedSteps = localStorage.getItem('userSyncedSteps');
      if (storedSteps) {
        setSteps(parseInt(storedSteps));
      } else {
        setSteps(0); // Default to 0 to match HomeTracker exactly
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

  // EXACT same formula as HomeTracker
  // Home:         remaining = budget - (eaten - burned)
  // SmartMealPlans: remaining = budget - (logged - burned)
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
            <span className="smp-summary-value cals-color">{userTargets.calories}</span>
            <span className="smp-summary-key">Calories</span>
          </div>
        </div>

        <div className="smp-summary-note">
          {remainingCalories > 0
            ? `⚡ ${remainingCalories} kcal remaining to hit your daily target (${userTargets.calories} budget${caloriesBurned > 0 ? ` + ${caloriesBurned} step-burn` : ''})`
            : remainingCalories === 0
            ? '🎯 Perfect! Daily calorie target achieved!'
            : `⚠️ ${Math.abs(remainingCalories)} kcal over today's budget`
          }
        </div>
      </div>

      {/* Meal Cards */}
      <div className="smp-meals-list">
        {MEAL_PLAN.map((meal) => (
          <MealCard key={`${diet}-${meal.id}`} data={meal} userTargets={userTargets} />
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
