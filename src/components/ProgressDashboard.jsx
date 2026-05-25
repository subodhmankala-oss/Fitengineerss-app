import React, { useState, useEffect } from 'react';
import './ProgressDashboard.css';

// Generating clean daily mock data for 30 days
const generateMockData = () => {
  const water = [];
  const protein = [];
  const fats = [];
  const lifting = []; // Deadlift 1RM

  for (let i = 1; i <= 30; i++) {
    // Water oscillating between 2.0 and 4.5 L, target is 4.0L
    const wVal = parseFloat((3.0 + Math.sin(i / 1.5) * 1.0 + Math.random() * 0.4).toFixed(1));
    water.push({ day: i, val: wVal, target: 4.0 });

    // Protein oscillating between 90 and 155 g, target is 130g
    const pVal = Math.round(115 + Math.cos(i / 2) * 20 + Math.random() * 15);
    protein.push({ day: i, val: pVal, target: 130 });

    // Fats oscillating between 30 and 65 g, target is 50g
    const fVal = Math.round(42 + Math.sin(i / 3) * 10 + Math.random() * 8);
    fats.push({ day: i, val: fVal, target: 50 });

    // Lifting displaying steady progressive overload! 90kg -> 125kg
    const baseL = 90 + Math.floor(i / 4) * 5;
    const lVal = baseL + (i % 4 === 0 ? 2 : 0) + Math.floor(Math.random() * 3);
    lifting.push({ day: i, val: lVal, target: 100 });
  }

  return { water, protein, fats, lifting };
};

const ProgressDashboard = () => {
  const [activeTab, setActiveTab] = useState('water');
  const [selectedDayIndex, setSelectedDayIndex] = useState(29); // Default to last day
  const [data, setData] = useState(null);

  useEffect(() => {
    let history = null;
    const storedHistory = localStorage.getItem('monthlyProgressHistory');
    if (storedHistory) {
      try {
        history = JSON.parse(storedHistory);
      } catch (e) {
        console.error(e);
      }
    }
    
    if (!history) {
      history = generateMockData();
      localStorage.setItem('monthlyProgressHistory', JSON.stringify(history));
    }
    
    // Overlay today's live tracked values so graph is dynamically updated
    const today = new Date();
    const todayIdx = (today.getDate() - 1) % 30;
    
    const waterGl = parseInt(localStorage.getItem('waterGlasses') || '0');
    const waterL = waterGl * 0.25;
    
    const eatenCals = parseInt(localStorage.getItem('userLoggedCalories') || '0');
    const proteinTarget = parseInt(localStorage.getItem('userProteinTarget') || '130');
    const budget = parseInt(localStorage.getItem('userCalorieTarget') || '1800');
    
    let loggedProt = parseInt(localStorage.getItem('userLoggedProtein') || '0');
    if (loggedProt === 0 && eatenCals > 0) {
      loggedProt = Math.round(proteinTarget * (eatenCals / budget));
    }
    
    let loggedFat = parseInt(localStorage.getItem('userLoggedFats') || '0');
    if (loggedFat === 0 && eatenCals > 0) {
      const fatsTarget = parseInt(localStorage.getItem('userFatsTarget') || '60');
      loggedFat = Math.round(fatsTarget * (eatenCals / budget));
    }
    
    if (history.water[todayIdx]) history.water[todayIdx].val = waterL;
    if (history.protein[todayIdx]) history.protein[todayIdx].val = loggedProt;
    if (history.fats[todayIdx]) history.fats[todayIdx].val = loggedFat;
    
    setData(history);
  }, []);

  if (!data) return <div className="loading">Loading Analytics...</div>;

  const currentDataset = data[activeTab];
  const selectedDayData = currentDataset[selectedDayIndex];

  // Helper calculations for stats
  const vals = currentDataset.map(d => d.val);
  const avg = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  const peak = Math.max(...vals);
  const target = currentDataset[0].target;
  
  // Consistency: percentage of days meeting or exceeding target
  const consistentDays = currentDataset.filter(d => d.val >= d.target).length;
  const consistencyRate = Math.round((consistentDays / currentDataset.length) * 100);

  // SVG Chart Coordinate calculations
  const width = 500;
  const height = 200;
  const padding = 25;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const maxVal = Math.max(...vals, target) * 1.1; // 10% headroom
  const minVal = Math.min(...vals) * 0.9; // 10% floor

  const getX = (index) => padding + (index / (currentDataset.length - 1)) * chartWidth;
  const getY = (val) => padding + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;

  // Build the SVG path string for the line
  let pathD = '';
  currentDataset.forEach((d, idx) => {
    const x = getX(idx);
    const y = getY(d.val);
    if (idx === 0) pathD += `M ${x} ${y}`;
    else pathD += ` L ${x} ${y}`;
  });

  // Build target line Y position
  const targetY = getY(target);

  const getMetricDetails = () => {
    switch (activeTab) {
      case 'protein':
        return {
          title: 'Protein Intake Progress',
          unit: 'g',
          icon: '🥩',
          desc: 'Monthly tracking of your daily protein hits to support protein synthesis.',
          avgLabel: 'Avg Protein',
          peakLabel: 'Peak Intake'
        };
      case 'fats':
        return {
          title: 'Fats Awareness Progress',
          unit: 'g',
          icon: '🥑',
          desc: 'Fats awareness metrics to ensure clean hormone health and lipid balancing.',
          avgLabel: 'Avg Fats',
          peakLabel: 'Peak Fats'
        };
      case 'lifting':
        return {
          title: 'Weight Lifting overload',
          unit: 'kg',
          icon: '🏋️‍♂️',
          desc: 'Deadlift 1-Rep Max showing steady progressive overload coaching metrics.',
          avgLabel: 'Avg Lift',
          peakLabel: 'Peak 1RM'
        };
      case 'water':
      default:
        return {
          title: 'Water Intake Progress',
          unit: 'L',
          icon: '💧',
          desc: 'Monthly hydration consistency dashboard tracking daily fluid metrics.',
          avgLabel: 'Avg Water',
          peakLabel: 'Peak Day'
        };
    }
  };

  const info = getMetricDetails();

  return (
    <div className="progress-dashboard-container animate-slide-up">
      <div className="screen-header">
        <h1 className="screen-title">Accountability</h1>
        <p className="screen-subtitle">Your monthly progress graphs.</p>
      </div>

      {/* Tab Switcher */}
      <div className="progress-tabs">
        <button className={`tab-btn ${activeTab === 'water' ? 'active' : ''}`} onClick={() => { setActiveTab('water'); setSelectedDayIndex(29); }}>
          <span>💧</span> Water
        </button>
        <button className={`tab-btn ${activeTab === 'protein' ? 'active' : ''}`} onClick={() => { setActiveTab('protein'); setSelectedDayIndex(29); }}>
          <span>🥩</span> Protein
        </button>
        <button className={`tab-btn ${activeTab === 'fats' ? 'active' : ''}`} onClick={() => { setActiveTab('fats'); setSelectedDayIndex(29); }}>
          <span>🥑</span> Fats
        </button>
        <button className={`tab-btn ${activeTab === 'lifting' ? 'active' : ''}`} onClick={() => { setActiveTab('lifting'); setSelectedDayIndex(29); }}>
          <span>🏋️‍♂️</span> Lifting
        </button>
      </div>

      <div className="dashboard-grid">
        {/* Interactive Graph Widget */}
        <div className="widget-card span-2 highlight">
          <div className="widget-header justify-between">
            <div className="flex-row">
              <span className="icon">{info.icon}</span>
              <h3>{info.title}</h3>
            </div>
            <span className="badge-trend">📈 Monthly Trend</span>
          </div>

          <div className="widget-body">
            {/* The SVG Graph */}
            <div className="svg-container">
              <svg viewBox={`0 0 ${width} ${height}`} className="progress-svg-chart">
                {/* Horizontal Guide Lines */}
                <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                {/* Target Guideline */}
                <line 
                  x1={padding} 
                  y1={targetY} 
                  x2={width - padding} 
                  y2={targetY} 
                  stroke="rgba(245, 158, 11, 0.4)" 
                  strokeWidth="1.5" 
                  strokeDasharray="4 4" 
                />
                <text x={width - padding - 65} y={targetY - 5} fill="rgba(245, 158, 11, 0.6)" fontSize="7" fontWeight="bold">
                  Target: {target}{info.unit}
                </text>

                {/* Smooth Chart Curve */}
                <path 
                  d={pathD} 
                  fill="none" 
                  stroke="var(--primary-accent-light)" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="chart-path"
                />

                {/* Hover line indicator */}
                <line 
                  x1={getX(selectedDayIndex)} 
                  y1={padding} 
                  x2={getX(selectedDayIndex)} 
                  y2={padding + chartHeight} 
                  stroke="rgba(16, 185, 129, 0.3)" 
                  strokeWidth="1.5" 
                />

                {/* Hover node circle */}
                <circle 
                  cx={getX(selectedDayIndex)} 
                  cy={getY(selectedDayData.val)} 
                  r="6" 
                  fill="#10b981" 
                  stroke="#090e17" 
                  strokeWidth="2" 
                />
              </svg>
            </div>

            {/* Slider to interactively view individual days */}
            <div className="slider-container">
              <div className="slider-header-info">
                <span>📅 Select Day (Day 1 - 30)</span>
                <strong>Day {selectedDayData.day}: <span className="highlight-text">{selectedDayData.val}{info.unit}</span></strong>
              </div>
              <input 
                type="range" 
                min="0" 
                max="29" 
                value={selectedDayIndex} 
                onChange={(e) => setSelectedDayIndex(parseInt(e.target.value))} 
                className="interactive-day-slider"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Statistics widgets */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="icon">📊</span>
            <h3>Key Metrics</h3>
          </div>
          <div className="widget-body flex-col gap-4">
            <div className="stat-box">
              <span className="stat-title">{info.avgLabel}</span>
              <span className="current-stat">{avg} {info.unit}</span>
            </div>
            <div className="stat-box">
              <span className="stat-title">{info.peakLabel}</span>
              <span className="current-stat text-emerald">{peak} {info.unit}</span>
            </div>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <span className="icon">🔥</span>
            <h3>Accountability Score</h3>
          </div>
          <div className="widget-body center">
            <div className="circular-mini">
              <svg viewBox="0 0 36 36" className="circular-chart">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="circle" strokeDasharray={`${consistencyRate}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="percentage">{consistencyRate}%</div>
            </div>
            <p className="widget-sub">consistency rate</p>
          </div>
        </div>

        {/* Explanatory text block */}
        <div className="widget-card span-2 desc-widget">
          <h4>💡 Analytics Insight</h4>
          <p>{info.desc} Consistency is the foundation of habit formation and metabolic success.</p>
        </div>
      </div>
    </div>
  );
};

export default ProgressDashboard;
