import React, { useState } from 'react';
import './Onboarding.css';

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('Moderately Active');
  const [goal, setGoal] = useState('');
  const [issue, setIssue] = useState('');
  const [diet, setDiet] = useState('');

  const TOTAL_STEPS = 6;

  const calculateTargets = (selectedGoal) => {
    const w = parseFloat(weight) || 70;
    const h = parseFloat(height) || 170;
    const a = parseInt(age) || 28;

    // Mifflin-St Jeor BMR Formula
    const bmr = 10 * w + 6.25 * h - 5 * a + 5;

    // Activity Factor
    let multiplier = 1.2;
    if (activity === 'Lightly Active') multiplier = 1.375;
    else if (activity === 'Moderately Active') multiplier = 1.55;
    else if (activity === 'Very Active') multiplier = 1.725;

    const tdee = bmr * multiplier;

    // Adjust Calories based on Goal
    let calorieTarget = Math.round(tdee);
    let proteinGrams = Math.round(w * 1.5); // Default Gut Fix

    if (selectedGoal === 'Fat Loss') {
      calorieTarget = Math.round(tdee - 500);
      if (calorieTarget < 1200) calorieTarget = 1200; // Safe threshold
      proteinGrams = Math.round(w * 1.8);
    } else if (selectedGoal === 'Muscle Building') {
      calorieTarget = Math.round(tdee + 300);
      proteinGrams = Math.round(w * 2.0);
    }

    // Round to nearest 50 for clean numbers
    calorieTarget = Math.round(calorieTarget / 50) * 50;

    // Fats: 25% of calories (9 kcal/g)
    let fatGrams = Math.round((calorieTarget * 0.25) / 9);
    fatGrams = Math.round(fatGrams / 5) * 5;

    // Carbs: remaining calories (4 kcal/g)
    const remainingCals = calorieTarget - (proteinGrams * 4) - (fatGrams * 9);
    let carbGrams = Math.round(remainingCals / 4);
    if (carbGrams < 50) carbGrams = 50; // Safety floor
    carbGrams = Math.round(carbGrams / 5) * 5;

    return {
      calories: calorieTarget,
      protein: proteinGrams,
      carbs: carbGrams,
      fats: fatGrams
    };
  };

  const handleNext = () => {
    if (step === 1 && !name.trim()) return;
    if (step === 2 && (!age || !height || !weight)) return;
    if (step === 3 && !activity) return;
    if (step === 4 && !goal) return;
    if (step === 5 && !issue) return;
    if (step === 6 && !diet) return;

    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      const targets = calculateTargets(goal);
      
      localStorage.setItem('userName', name.trim());
      localStorage.setItem('userAge', age);
      localStorage.setItem('userHeight', height);
      localStorage.setItem('userWeight', weight);
      localStorage.setItem('userActivity', activity);
      localStorage.setItem('userGoal', goal);
      localStorage.setItem('userIssue', issue);
      localStorage.setItem('userDiet', diet);
      
      localStorage.setItem('userCalorieTarget', targets.calories.toString());
      localStorage.setItem('userProteinTarget', targets.protein.toString());
      localStorage.setItem('userCarbsTarget', targets.carbs.toString());
      localStorage.setItem('userFatsTarget', targets.fats.toString());
      
      onComplete();
    }
  };

  return (
    <div className="onboarding-container">
      <div className="onboarding-header">
        <h2 className="glow-text">Fitengineers App Setup</h2>
        <div className="step-bar">
          <div className="step-progress" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}></div>
        </div>
        <div className="step-counter">Step {step} of {TOTAL_STEPS}</div>
      </div>
      
      {step === 1 && (
        <div className="onboarding-step animate-in">
          <h3>Welcome! What's your name?</h3>
          <p className="step-hint">Let's personalize your coaching experience.</p>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Enter your name" 
            autoFocus
          />
        </div>
      )}
      
      {step === 2 && (
        <div className="onboarding-step animate-in">
          <h3>Tell us about yourself</h3>
          <p className="step-hint">We use these to calculate your custom BMR and macro metrics.</p>
          <div className="input-group-row">
            <div className="input-field">
              <label>Age (years)</label>
              <input 
                type="number" 
                value={age} 
                onChange={e => setAge(e.target.value)} 
                placeholder="25" 
                min="10"
                max="100"
              />
            </div>
            <div className="input-field">
              <label>Height (cm)</label>
              <input 
                type="number" 
                value={height} 
                onChange={e => setHeight(e.target.value)} 
                placeholder="175" 
                min="100"
                max="250"
              />
            </div>
          </div>
          <div className="input-field mt-2">
            <label>Weight (kg)</label>
            <input 
              type="number" 
              value={weight} 
              onChange={e => setWeight(e.target.value)} 
              placeholder="72.5" 
              step="0.1"
              min="30"
              max="250"
            />
          </div>
        </div>
      )}
      
      {step === 3 && (
        <div className="onboarding-step animate-in">
          <h3>What's your physical activity level?</h3>
          <p className="step-hint">This calibrates your daily maintenance TDEE score.</p>
          <button 
            className={`select-btn ${activity === 'Sedentary' ? 'selected' : ''}`}
            onClick={() => setActivity('Sedentary')}
          >
            <strong>Sedentary</strong>
            <span className="btn-desc">Little or no weekly exercise</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Lightly Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Lightly Active')}
          >
            <strong>Lightly Active</strong>
            <span className="btn-desc">Light exercise/sports 1-3 days/week</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Moderately Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Moderately Active')}
          >
            <strong>Moderately Active</strong>
            <span className="btn-desc">Moderate exercise/sports 3-5 days/week</span>
          </button>
          <button 
            className={`select-btn ${activity === 'Very Active' ? 'selected' : ''}`}
            onClick={() => setActivity('Very Active')}
          >
            <strong>Very Active</strong>
            <span className="btn-desc">Hard training/sports 6-7 days/week</span>
          </button>
        </div>
      )}
      
      {step === 4 && (
        <div className="onboarding-step animate-in">
          <h3>What is your primary fitness goal?</h3>
          <p className="step-hint">This defines the calorie offset and workout direction.</p>
          <button 
            className={`select-btn ${goal === 'Fat Loss' ? 'selected' : ''}`}
            onClick={() => setGoal('Fat Loss')}
          >
            <strong>🔥 Fat Loss</strong>
            <span className="btn-desc">Stay in caloric deficit & retain lean mass</span>
          </button>
          <button 
            className={`select-btn ${goal === 'Gut Fix' ? 'selected' : ''}`}
            onClick={() => setGoal('Gut Fix')}
          >
            <strong>🌱 Gut Fix</strong>
            <span className="btn-desc">Fix acidity, bloating & restore gut microbiome</span>
          </button>
          <button 
            className={`select-btn ${goal === 'Muscle Building' ? 'selected' : ''}`}
            onClick={() => setGoal('Muscle Building')}
          >
            <strong>💪 Muscle Building</strong>
            <span className="btn-desc">Achieve anabolic surplus & progressive overload</span>
          </button>
        </div>
      )}
      
      {step === 5 && (
        <div className="onboarding-step animate-in">
          <h3>Any metabolic or digestive challenges?</h3>
          <p className="step-hint">Helps tailor daily checklist alerts and warnings.</p>
          <button 
            className={`select-btn ${issue === 'Bloating' ? 'selected' : ''}`}
            onClick={() => setIssue('Bloating')}
          >
            🎈 Bloating (frequent gas or fullness)
          </button>
          <button 
            className={`select-btn ${issue === 'Acidity' ? 'selected' : ''}`}
            onClick={() => setIssue('Acidity')}
          >
            🔥 Acidity & Heartburn
          </button>
          <button 
            className={`select-btn ${issue === 'Constipation' ? 'selected' : ''}`}
            onClick={() => setIssue('Constipation')}
          >
            🐢 Constipation / Sluggish digestion
          </button>
          <button 
            className={`select-btn ${issue === 'None' ? 'selected' : ''}`}
            onClick={() => setIssue('None')}
          >
            ✨ None / Just want to stay fit
          </button>
        </div>
      )}

      {step === 6 && (
        <div className="onboarding-step animate-in">
          <h3>What's your dietary preference?</h3>
          <p className="step-hint">We'll build your entire meal plan around this. You can always toggle it later.</p>

          <button
            className={`select-btn diet-card ${diet === 'Vegetarian' ? 'selected diet-veg-selected' : ''}`}
            onClick={() => setDiet('Vegetarian')}
          >
            <div className="diet-card-inner">
              <span className="diet-icon">🥦</span>
              <div className="diet-card-text">
                <strong>Vegetarian</strong>
                <span className="btn-desc">Paneer, dal, tofu, eggs, legumes, dairy</span>
              </div>
              <span className="diet-dot veg-dot">🟢</span>
            </div>
          </button>

          <button
            className={`select-btn diet-card ${diet === 'Non-Vegetarian' ? 'selected diet-nonveg-selected' : ''}`}
            onClick={() => setDiet('Non-Vegetarian')}
          >
            <div className="diet-card-inner">
              <span className="diet-icon">🍗</span>
              <div className="diet-card-text">
                <strong>Non-Vegetarian</strong>
                <span className="btn-desc">Chicken, fish, eggs, paneer, meat sources</span>
              </div>
              <span className="diet-dot nonveg-dot">🔴</span>
            </div>
          </button>

          <div className="diet-note">
            🔒 Your meals, macros & portions will be auto-personalized based on this preference.
          </div>
        </div>
      )}
      
      <button 
        className="btn-next" 
        onClick={handleNext}
        disabled={
          (step === 1 && !name.trim()) ||
          (step === 2 && (!age || !height || !weight)) ||
          (step === 3 && !activity) ||
          (step === 4 && !goal) ||
          (step === 5 && !issue) ||
          (step === 6 && !diet)
        }
      >
        {step === TOTAL_STEPS ? "🚀 Let's Personalize App!" : "Next Step ➔"}
      </button>
    </div>
  );
};

export default Onboarding;
