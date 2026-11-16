// The heat map's colour key — shared by the home heat map and the logger's
// "This week's muscles" sheet so both read the same.
export const LEGEND = [
  { key: 'not_trained', color: 'var(--text-subtle)', label: 'Not Trained' },
  { key: 'low', color: '#3b82f6', label: 'Low' },
  { key: 'optimal', color: '#10b981', label: 'Optimal' }, // same green the map paints (getHeatMapTier)
  { key: 'high', color: '#f97316', label: 'High' },
  { key: 'very_high', color: '#ef4444', label: 'Very High' },
];
