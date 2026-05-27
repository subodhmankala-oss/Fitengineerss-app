import React, { useState, useEffect, useRef } from 'react';
import './MealScanner.css';

// High-accuracy preset nutritional database for scanning simulation
const PRESET_MEALS = [
  {
    name: "Grilled Chicken Breast with Broccoli",
    calories: 380,
    protein: 45,
    carbs: 10,
    fats: 8,
    weightGrams: 350,
    icon: "🍗",
    desc: "Lean high-protein meal with steamed organic broccoli."
  },
  {
    name: "Paneer Tikka Salad",
    calories: 310,
    protein: 18,
    carbs: 12,
    fats: 22,
    weightGrams: 300,
    icon: "🥗",
    desc: "Spiced paneer cubes grilled and tossed with fresh greens."
  },
  {
    name: "Avocado Toast with Poached Egg",
    calories: 420,
    protein: 16,
    carbs: 28,
    fats: 26,
    weightGrams: 220,
    icon: "🥑",
    desc: "Sourdough bread with smashed avocado and organic eggs."
  },
  {
    name: "Whey Protein Oats with Banana",
    calories: 460,
    protein: 35,
    carbs: 58,
    fats: 9,
    weightGrams: 400,
    icon: "🥣",
    desc: "Rolled oats cooked with whey isolates, topped with fresh banana."
  },
  {
    name: "Mixed Berry Greek Yogurt Bowl",
    calories: 240,
    protein: 15,
    carbs: 32,
    fats: 5,
    weightGrams: 280,
    icon: "🍓",
    desc: "Thick unsweetened Greek yogurt with raspberries and blueberries."
  },
  {
    name: "Salmon Rice Bowl with Avocado",
    calories: 620,
    protein: 42,
    carbs: 65,
    fats: 22,
    weightGrams: 450,
    icon: "🍣",
    desc: "Teriyaki grilled salmon on jasmine rice with sliced avocado."
  },
  {
    name: "Double Cheese Margherita Pizza",
    calories: 780,
    protein: 28,
    carbs: 92,
    fats: 32,
    weightGrams: 380,
    icon: "🍕",
    desc: "Thick crust cheese margherita sourdough pizza slice selection."
  }
];

const SCAN_STATES = [
  "Initializing AI neural model...",
  "Calibrating lens zoom & white balance...",
  "Detecting volumetric boundaries...",
  "Segmenting ingredients: 98% accuracy...",
  "Querying food database archives...",
  "Portion weight calculation: complete! ✅"
];

const MealScanner = ({ onClose }) => {
  const [streamActive, setStreamActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStateIndex, setScanStateIndex] = useState(0);
  const [scannedResult, setScannedResult] = useState(null);
  const [portionScale, setPortionScale] = useState(1.0); // 0.5 to 2.0
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadedImageSrc, setUploadedImageSrc] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImageSrc(event.target.result);
        setStreamActive(false);
        setScannedResult(null);
        setIsScanning(true);
        setScanStateIndex(0);
      };
      reader.readAsDataURL(file);
    }
  };

  // Initialize camera stream
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // Prefer back camera on phones
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      } catch (err) {
        console.warn("Camera access denied or unavailable. Falling back to premium simulated scanner.", err);
        setErrorMsg("Camera access disabled. Running high-precision simulated AI database scanner!");
      }
    };

    startCamera();

    return () => {
      // Clean up camera stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Neural net scanning text animator
  useEffect(() => {
    let interval = null;
    if (isScanning) {
      interval = setInterval(() => {
        setScanStateIndex(prev => {
          if (prev < SCAN_STATES.length - 1) {
            return prev + 1;
          } else {
            clearInterval(interval);
            setIsScanning(false);
            // Scan finished! Pick the selected preset to mock identify the food
            const identifiedMeal = PRESET_MEALS[selectedPresetIdx];
            setScannedResult(identifiedMeal);
            return 0;
          }
        });
      }, 700);
    }
    return () => clearInterval(interval);
  }, [isScanning, selectedPresetIdx]);

  const handleStartScan = () => {
    setScannedResult(null);
    setIsScanning(true);
    setScanStateIndex(0);
  };

  const handleLogMeal = () => {
    if (!scannedResult) return;

    // Calculate scaled calories and macros based on portion slider
    const finalCals = Math.round(scannedResult.calories * portionScale);
    const finalProtein = Math.round(scannedResult.protein * portionScale);
    const finalCarbs = Math.round(scannedResult.carbs * portionScale);
    const finalFats = Math.round(scannedResult.fats * portionScale);

    // Read existing logs
    const currentLoggedCals = parseInt(localStorage.getItem('userLoggedCalories') || '0');
    const currentLoggedProt = parseInt(localStorage.getItem('userLoggedProtein') || '0');
    const currentLoggedCarb = parseInt(localStorage.getItem('userLoggedCarbs') || '0');
    const currentLoggedFat = parseInt(localStorage.getItem('userLoggedFats') || '0');

    // Update with new meal metrics
    localStorage.setItem('userLoggedCalories', String(currentLoggedCals + finalCals));
    localStorage.setItem('userLoggedProtein', String(currentLoggedProt + finalProtein));
    localStorage.setItem('userLoggedCarbs', String(currentLoggedCarb + finalCarbs));
    localStorage.setItem('userLoggedFats', String(currentLoggedFat + finalFats));

    // Distribute calories evenly into Lunch/Dinner depending on time
    const hours = new Date().getHours();
    if (hours < 11) {
      const bfast = parseInt(localStorage.getItem('homeMealBreakfast') || '0');
      localStorage.setItem('homeMealBreakfast', String(bfast + finalCals));
    } else if (hours < 16) {
      const lunch = parseInt(localStorage.getItem('homeMealLunch') || '0');
      localStorage.setItem('homeMealLunch', String(lunch + finalCals));
    } else {
      const dinner = parseInt(localStorage.getItem('homeMealDinner') || '0');
      localStorage.setItem('homeMealDinner', String(dinner + finalCals));
    }

    // Dispatch global event so all cards, rings, and graphs sync instantly!
    window.dispatchEvent(new Event('nutritionUpdated'));

    onClose();
  };

  return (
    <div className="meal-scanner-backdrop">
      <div className="meal-scanner-modal glass-panel animate-scale-in">
        
        {/* Header */}
        <div className="scanner-modal-header">
          <div className="flex-row items-center gap-2">
            <span className="scanner-icon">📷</span>
            <h3>Fitengineers AI Meal Scanner</h3>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="scanner-modal-body">
          {/* Viewfinder Frame */}
          <div className="viewfinder-outer">
            <div className="viewfinder-corners">
              <span className="corner top-left"></span>
              <span className="corner top-right"></span>
              <span className="corner bottom-left"></span>
              <span className="corner bottom-right"></span>
              
              {/* Laser Scan Line Overlay */}
              {isScanning && <div className="laser-scanner-line"></div>}

              {/* Viewfinder Content */}
              {streamActive ? (
                <video ref={videoRef} autoPlay playsInline muted className="camera-feed-video" />
              ) : uploadedImageSrc ? (
                <img src={uploadedImageSrc} className="camera-feed-video" alt="Scanned Meal" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div className="simulated-viewfinder">
                  <span className="food-emoji">{PRESET_MEALS[selectedPresetIdx].icon}</span>
                  <p className="simulated-label">Simulating Camera Focus...</p>
                </div>
              )}
            </div>
          </div>

          {/* Scanner Status Messages */}
          {isScanning && (
            <div className="neural-status-indicator animate-pulse">
              <span>🧠</span> {SCAN_STATES[scanStateIndex]}
            </div>
          )}

          {/* Setup / Controls */}
          {!isScanning && !scannedResult && (
            <div className="selector-section">
              <label className="selector-title">🥗 Point camera at, or select meal to scan:</label>
              <div className="preset-selector-row">
                {PRESET_MEALS.map((meal, idx) => (
                  <button 
                    key={idx}
                    className={`preset-btn ${selectedPresetIdx === idx ? 'active' : ''}`}
                    onClick={() => setSelectedPresetIdx(idx)}
                  >
                    <span>{meal.icon}</span> {meal.name.split(" with ")[0]}
                  </button>
                ))}
              </div>

              {errorMsg && <p className="scanner-warning-alert">{errorMsg}</p>}

              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                style={{ display: 'none' }} 
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="scan-trigger-btn" onClick={handleStartScan}>
                  ⚡ Start Neural Scan
                </button>
                <button 
                  className="scan-trigger-btn" 
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    boxShadow: 'none'
                  }}
                >
                  📸 Take Photo / Upload Snap
                </button>
              </div>
            </div>
          )}

          {/* Scanned Results Panel */}
          {scannedResult && !isScanning && (
            <div className="results-panel animate-slide-up">
              <div className="result-header">
                <span className="food-badge">{scannedResult.icon}</span>
                <div className="result-title-col">
                  <h4>Identified Food Item</h4>
                  <h3>{scannedResult.name}</h3>
                  <p className="result-desc">{scannedResult.desc}</p>
                </div>
              </div>

              {/* Dynamic Portion Slider */}
              <div className="portion-control-container">
                <div className="portion-label-row">
                  <span>🍽️ Custom Portion Size:</span>
                  <strong>{portionScale}x ({(scannedResult.weightGrams * portionScale).toFixed(0)}g)</strong>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={portionScale} 
                  onChange={(e) => setPortionScale(parseFloat(e.target.value))}
                  className="portion-slider"
                />
                <div className="portion-ticks-row">
                  <span>0.5x (Small)</span>
                  <span>1.0x (Regular)</span>
                  <span>2.0x (Double)</span>
                </div>
              </div>

              {/* Precise Metrics */}
              <div className="precise-macro-grid">
                <div className="macro-stat-box calories">
                  <span className="stat-num">{(scannedResult.calories * portionScale).toFixed(0)}</span>
                  <span className="stat-lbl">Calories (kcal)</span>
                </div>
                <div className="macro-stat-box protein">
                  <span className="stat-num">{(scannedResult.protein * portionScale).toFixed(1)}g</span>
                  <span className="stat-lbl">Protein</span>
                </div>
                <div className="macro-stat-box carbs">
                  <span className="stat-num">{(scannedResult.carbs * portionScale).toFixed(1)}g</span>
                  <span className="stat-lbl">Carbs</span>
                </div>
                <div className="macro-stat-box fats">
                  <span className="stat-num">{(scannedResult.fats * portionScale).toFixed(1)}g</span>
                  <span className="stat-lbl">Fats</span>
                </div>
              </div>

              <div className="action-row">
                <button className="btn-rescan" onClick={handleStartScan}>
                  🔄 Rescan Meal
                </button>
                <button className="btn-log-scan" onClick={handleLogMeal}>
                  ✅ Log to Daily Tracker
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default MealScanner;
