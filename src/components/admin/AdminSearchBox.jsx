import React, { useRef } from 'react';

// Same look as the coach dashboard's client search (trainer-search-* classes
// in TrainerDashboard.css), including the ✕ clear button.
export default function AdminSearchBox({ value, onChange, placeholder }) {
  const inputRef = useRef(null);
  return (
    <div className="trainer-search-wrap" style={{ marginBottom: '14px' }}>
      <input
        ref={inputRef}
        type="text"
        className="trainer-search-input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="trainer-search-clear-btn"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
