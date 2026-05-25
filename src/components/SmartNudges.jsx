import React, { useState, useEffect } from 'react';
import './SmartNudges.css';

const nudges = [
  "Eat slow... or suffer later 😌",
  "Walk 10 mins now. Don't negotiate.",
  "Phone down. Food up."
];

const SmartNudges = () => {
  const [currentNudge, setCurrentNudge] = useState('');

  useEffect(() => {
    // Show a random nudge every 30 seconds for demo purposes
    const interval = setInterval(() => {
      const rand = nudges[Math.floor(Math.random() * nudges.length)];
      setCurrentNudge(rand);
      setTimeout(() => setCurrentNudge(''), 5000); // hide after 5s
    }, 15000); 

    return () => clearInterval(interval);
  }, []);

  if (!currentNudge) return null;

  return (
    <div className="smart-nudge-toast">
      🔔 {currentNudge}
    </div>
  );
};

export default SmartNudges;
