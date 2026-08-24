import { useCallback, useEffect, useRef, useState } from 'react';

// Connects to any BLE wearable that implements the standard GATT Heart Rate
// Service (0x180D) — this covers essentially every fitness band/smartwatch
// with a heart-rate sensor (Garmin, Polar, most Wear OS watches, chest
// straps, etc.), not a single vendor. We deliberately do NOT try to install
// on/run inside the watch itself: Web Bluetooth only exists in the phone's/
// desktop's browser, so the "integration" here is "your browser talks
// directly to the watch over BLE while the workout is open," which is the
// only piece a PWA can actually do without a native wrapper.
//
// Browser support: Chrome/Edge/Opera on Android, ChromeOS, Windows, macOS,
// Linux. NOT supported in Safari (iOS/macOS) or Firefox — `isSupported`
// reflects that so callers can hide/disable the UI instead of showing a
// button that silently does nothing.
const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT_CHAR = 'heart_rate_measurement';
const BATTERY_SERVICE = 'battery_service';
const BATTERY_LEVEL_CHAR = 'battery_level';

// Parses the Heart Rate Measurement characteristic per the Bluetooth SIG
// spec (GSS org.bluetooth.characteristic.heart_rate_measurement): byte 0 is
// flags, bit 0 of which selects whether the BPM value is uint8 or uint16.
function parseHeartRateValue(dataView) {
  const flags = dataView.getUint8(0);
  const is16Bit = (flags & 0x1) === 1;
  const bpm = is16Bit ? dataView.getUint16(1, /* littleEndian */ true) : dataView.getUint8(1);
  // Bit 3 flags whether contact-sensor support is present; bit 2 (when bit 3
  // set) says whether contact is actually detected — e.g. a strap not yet
  // snug against skin. Surfaced so the UI can show "adjust strap" instead of
  // a misleadingly confident reading.
  const contactSupported = (flags & 0x4) !== 0;
  const contactDetected = (flags & 0x2) !== 0;
  return {
    bpm,
    contactSupported,
    contactDetected: contactSupported ? contactDetected : null,
  };
}

export function useHeartRateMonitor() {
  const [isSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.bluetooth);
  const [status, setStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [bpm, setBpm] = useState(null);
  const [contact, setContact] = useState(null); // null (unknown/unsupported) | true | false
  const [deviceName, setDeviceName] = useState(null);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [error, setError] = useState(null);

  const deviceRef = useRef(null);
  const hrCharRef = useRef(null);
  // Every BPM sample seen since the last resetSamples() call, so the caller
  // (WorkoutTracker) can compute avg/max for the session without having to
  // duplicate its own listener.
  const samplesRef = useRef([]);

  const handleHeartRateNotification = useCallback((event) => {
    const { bpm: value, contactDetected } = parseHeartRateValue(event.target.value);
    setBpm(value);
    setContact(contactDetected);
    // Ignore obviously-bogus zero readings (sensor not on skin yet) so they
    // don't drag down the session average.
    if (value > 0) samplesRef.current.push(value);
  }, []);

  const handleDisconnected = useCallback(() => {
    setStatus('disconnected');
    setBpm(null);
    setContact(null);
    setBatteryLevel(null);
  }, []);

  const disconnect = useCallback(() => {
    const device = deviceRef.current;
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  }, []);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('This browser doesn’t support Web Bluetooth. Try Chrome or Edge on Android/desktop.');
      return;
    }
    setError(null);
    setStatus('connecting');
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [BATTERY_SERVICE],
      });
      deviceRef.current = device;
      setDeviceName(device.name || 'Heart rate monitor');
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      const hrService = await server.getPrimaryService(HEART_RATE_SERVICE);
      const hrChar = await hrService.getCharacteristic(HEART_RATE_MEASUREMENT_CHAR);
      hrCharRef.current = hrChar;
      hrChar.addEventListener('characteristicvaluechanged', handleHeartRateNotification);
      await hrChar.startNotifications();

      // Battery level is optional — most watches expose it, but don't fail
      // the whole connection if this particular device doesn't.
      try {
        const batteryService = await server.getPrimaryService(BATTERY_SERVICE);
        const batteryChar = await batteryService.getCharacteristic(BATTERY_LEVEL_CHAR);
        const value = await batteryChar.readValue();
        setBatteryLevel(value.getUint8(0));
      } catch {
        setBatteryLevel(null);
      }

      samplesRef.current = [];
      setStatus('connected');
    } catch (err) {
      setStatus('disconnected');
      // User dismissing the device picker throws NotFoundError — not a real
      // error, just "changed their mind."
      if (err?.name !== 'NotFoundError') {
        setError(err?.message || 'Could not connect to the heart rate monitor.');
      }
    }
  }, [isSupported, handleDisconnected, handleHeartRateNotification]);

  useEffect(() => {
    return () => {
      const hrChar = hrCharRef.current;
      if (hrChar) {
        hrChar.removeEventListener('characteristicvaluechanged', handleHeartRateNotification);
      }
      const device = deviceRef.current;
      if (device) {
        device.removeEventListener('gattserverdisconnected', handleDisconnected);
        if (device.gatt?.connected) device.gatt.disconnect();
      }
    };
  }, [handleHeartRateNotification, handleDisconnected]);

  // Returns { avg, max, count } for every sample recorded since the last
  // reset, and clears the buffer — call at the start of a fresh workout so
  // stats from a previous session don't leak in.
  const resetSamples = useCallback(() => {
    samplesRef.current = [];
  }, []);

  const getSessionStats = useCallback(() => {
    const samples = samplesRef.current;
    if (samples.length === 0) return { avg: null, max: null, count: 0 };
    const max = Math.max(...samples);
    const avg = Math.round(samples.reduce((sum, v) => sum + v, 0) / samples.length);
    return { avg, max, count: samples.length };
  }, []);

  return {
    isSupported,
    status, // 'disconnected' | 'connecting' | 'connected'
    bpm,
    contact,
    deviceName,
    batteryLevel,
    error,
    connect,
    disconnect,
    resetSamples,
    getSessionStats,
  };
}
