import webPush from 'web-push';

// Set VAPID keys
webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY || 'BIupVfv6kg0G6uCsUWYciNynMR5xs6F3dl3QWXjRWGFkfZzvBPClM_FSLCEInVTDF0wtMkk5sDfbmWH1b2RMuqk',
  process.env.VAPID_PRIVATE_KEY || 'Fi8qX-4M-3qo3IfOUT174OPWrcX6uoa0YFilm82IJTs'
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  const { subscription, userName } = req.body;

  if (!subscription) {
    return res.status(400).json({ error: 'subscription parameter is required.' });
  }

  try {
    const title = "Fitengineers Test Nudge 🥗";
    const body = `Hey ${userName || 'Warrior'}! This is a test push notification. If you received this, your mobile push pipeline is 100% active and working in the background! 💪`;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/logo.png',
      vibrate: [300, 100, 300, 100, 300]
    });

    await webPush.sendNotification(subscription, payload);

    return res.status(200).json({ success: true, message: 'Test notification sent successfully.' });
  } catch (error) {
    console.error('Test Push Notification Error:', error);
    return res.status(500).json({ error: 'Failed to send test push notification.', details: error.message });
  }
}
