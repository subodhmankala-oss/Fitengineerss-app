import React from 'react';
import { DAY_NAMES } from '../utils/weekPlan';
import './TrainingDayPicker.css';

// Seven day circles, Monday first; any number can be on.
export default function TrainingDayPicker({ days, onChange }) {
  const toggle = (i) => onChange(days.includes(i) ? days.filter(d => d !== i) : [...days, i].sort((a, b) => a - b));
  return (
    <div className="day-picker" role="group" aria-label="Which days suit you?">
      {DAY_NAMES.map((name, i) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          aria-pressed={days.includes(i)}
          className={`day-picker-day ${days.includes(i) ? 'selected' : ''}`}
          onClick={() => toggle(i)}
        >
          {name[0]}
        </button>
      ))}
    </div>
  );
}
