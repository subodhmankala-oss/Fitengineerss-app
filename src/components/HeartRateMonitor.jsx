import './HeartRateMonitor.css';

const HeartIcon = ({ size = 18, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 21s-6.7-4.35-9.33-8.2C.7 9.86 1.4 6.3 4.3 4.9c2.2-1.07 4.5-.28 5.9 1.5.4.5.7 1 .8 1.3.1-.3.4-.8.8-1.3 1.4-1.78 3.7-2.57 5.9-1.5 2.9 1.4 3.6 4.96 1.63 7.9C18.7 16.65 12 21 12 21Z" />
  </svg>
);

const BluetoothIcon = ({ size = 16, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6.5 6.5 17.5 17.5 12 23V1l5.5 5.5L6.5 17.5" />
  </svg>
);

// Presentational live-BPM widget for the active-workout screen. Purely
// props-driven — the actual Web Bluetooth connection lives in
// useHeartRateMonitor(), owned by WorkoutTracker itself, so the same hook
// instance that streams live BPM can also hand WorkoutTracker the session's
// avg/max reading at Finish time without prop-drilling a ref through here.
export default function HeartRateMonitor({
  isSupported,
  status, // 'disconnected' | 'connecting' | 'connected'
  bpm,
  contact, // null | true | false
  deviceName,
  batteryLevel,
  error,
  onConnect,
  onDisconnect,
}) {
  if (!isSupported) {
    return (
      <div className="hr-monitor hr-monitor--unsupported">
        <HeartIcon size={16} className="hr-monitor__icon" />
        <span>Heart rate sync needs Chrome or Edge (Android/desktop) — not available in this browser.</span>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <button type="button" className="hr-monitor hr-monitor--connect" onClick={onConnect}>
        <BluetoothIcon size={16} className="hr-monitor__icon" />
        <span>Connect heart rate monitor</span>
        {error && <span className="hr-monitor__error">{error}</span>}
      </button>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="hr-monitor hr-monitor--connecting">
        <span className="hr-monitor__spinner" />
        <span>Pair your watch — choose it from the browser prompt…</span>
      </div>
    );
  }

  // status === 'connected'
  return (
    <div className={`hr-monitor hr-monitor--live ${contact === false ? 'hr-monitor--no-contact' : ''}`}>
      <HeartIcon size={20} className="hr-monitor__icon hr-monitor__icon--pulse" />
      <div className="hr-monitor__reading">
        <span className="hr-monitor__bpm">{bpm ?? '--'}</span>
        <span className="hr-monitor__unit">bpm</span>
      </div>
      <div className="hr-monitor__meta">
        <span className="hr-monitor__device">{deviceName}</span>
        {batteryLevel != null && <span className="hr-monitor__battery">{batteryLevel}% battery</span>}
        {contact === false && <span className="hr-monitor__warning">Adjust strap/watch fit</span>}
      </div>
      <button type="button" className="hr-monitor__disconnect" onClick={onDisconnect} aria-label="Disconnect heart rate monitor">
        ×
      </button>
    </div>
  );
}
