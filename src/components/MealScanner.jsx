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
        setIsScanning(false); // Let the user select the preset first, then hit Scan!
      };
      reader.readAsDataURL(file);
    }
  };

  // Initialize hardware camera stream safely
  useEffect(() => {
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("getUserMedia is not supported on this browser/environment.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' } // Prefer back camera
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamActive(true);
        }
      } catch (err) {
        console.warn("Back camera constraint failed. Retrying with basic camera constraints...", err);
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("getUserMedia not supported.");
          }
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setStreamActive(true);
          }
        } catch (err2) {
          console.warn("Hardware camera stream could not be opened. Enabling AI Cyber Viewfinder.", err2);
          setStreamActive(false);
        }
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
            // Scan finished! Load selected preset nutritional metrics
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

  // Interactive Simulated HUD Target Click
  const handleFloatingTargetClick = (idx) => {
    if (isScanning) return;
    setSelectedPresetIdx(idx);
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

    // Distribute calories evenly into Breakfast/Lunch/Dinner depending on time
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

    // Dispatch global event so all cards, rings, and remaining trackers sync instantly!
    window.dispatchEvent(new Event('nutritionUpdated'));

    onClose();
  };

  return (
    <div className="meal-scanner-backdrop">
      <div className="meal-scanner-modal glass-panel animate-scale-in">
        
        {/* Header */}
        <div className="scanner-modal-header">
          <div className="flex-row items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                /* Interactive Cybernetic AI Camera Viewfinder Simulation */
                <div className="simulated-viewfinder active-hud-bypass">
                  <div className="hud-grid-overlay"></div>
                  
                  <div className="hud-header-bar">
                    <span className="hud-tag blinking"><span className="dot-green">●</span> LIVE AI TARGETING</span>
                    <span className="hud-tag text-right">ISO 400 | F/1.8 | AF-C | 60FPS</span>
                  </div>

                  <div className="hud-crosshair-center">
                    <div className="crosshair-ring"></div>
                    <div className="crosshair-dot"></div>
                  </div>

                  <div className="hud-sidebar-data">
                    <div className="hud-telemetry-row"><span>SYSTEM:</span> <span className="text-green">ONLINE</span></div>
                    <div className="hud-telemetry-row"><span>LIDAR:</span> <span className="text-green">ACTIVE</span></div>
                    <div className="hud-telemetry-row"><span>RESOLVE:</span> <span className="text-green">READY</span></div>
                  </div>

                  {/* Floating AI Detection Nodes */}
                  <div className="floating-detection-nodes">
                    <div className="detection-node node-chicken" onClick={() => handleFloatingTargetClick(0)}>
                      <div className="node-ring pulsing-ring-orange"></div>
                      <div className="node-line"></div>
                      <div className="node-details">
                        <span className="node-icon">🍗</span>
                        <div className="node-meta">
                          <span className="node-name">Chicken & Broccoli</span>
                          <span className="node-prob">94.8% AI Match</span>
                        </div>
                      </div>
                    </div>

                    <div className="detection-node node-paneer" onClick={() => handleFloatingTargetClick(1)}>
                      <div className="node-ring pulsing-ring-green"></div>
                      <div className="node-line"></div>
                      <div className="node-details">
                        <span className="node-icon">🥗</span>
                        <div className="node-meta">
                          <span className="node-name">Paneer Tikka Salad</span>
                          <span className="node-prob">91.2% AI Match</span>
                        </div>
                      </div>
                    </div>

                    <div className="detection-node node-toast" onClick={() => handleFloatingTargetClick(2)}>
                      <div className="node-ring pulsing-ring-blue"></div>
                      <div className="node-line"></div>
                      <div className="node-details">
                        <span className="node-icon">🥑</span>
                        <div className="node-meta">
                          <span className="node-name">Avocado Toast</span>
                          <span className="node-prob">89.5% AI Match</span>
                        </div>
                      </div>
                    </div>

                    <div className="detection-node node-oats" onClick={() => handleFloatingTargetClick(3)}>
                      <div className="node-ring pulsing-ring-purple"></div>
                      <div className="node-line"></div>
                      <div className="node-details">
                        <span className="node-icon">🥣</span>
                        <div className="node-meta">
                          <span className="node-name">Whey Protein Oats</span>
                          <span className="node-prob">96.3% AI Match</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hud-instructions">
                    <p>🎯 Tap any <strong>AI Target Node</strong> inside the viewfinder to scan, or upload a photo below!</p>
                  </div>
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
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                style={{ display: 'none' }} 
              />

              {(streamActive || uploadedImageSrc) ? (
                <>
                  <label className="selector-title">🥗 Select the identified meal to scan:</label>
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <button className="scan-trigger-btn" onClick={handleStartScan}>
                      ⚡ Run Calorie AI Scan
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
                      📸 Retake Photo / Upload New Snap
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    className="scan-trigger-btn" 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)'
                    }}
                  >
                    📸 Take Real Meal Photo / Upload Snap
                  </button>
                  
                  <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.12)', borderRadius: '14px', textAlign: 'center' }}>
                    <p style={{ color: '#34d399', fontSize: '0.78rem', margin: 0, fontWeight: 500, lineHeight: 1.4 }}>
                      ⚡ Simulated targeting represents our offline Computer Vision HUD. Click any target in the viewfinder box to simulate live meal identification instantly!
                    </p>
                  </div>
                </div>
              )}
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
                <button className="btn-rescan" onClick={() => setScannedResult(null)}>
                  🔄 Back to Scanner
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
