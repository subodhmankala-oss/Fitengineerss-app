import { useEffect, useState } from 'react';
import { qrDataUrl, upiLink } from './gymUpi';
import { rupees } from './gymView';

// The pay-by-UPI card for a member who owes money: a QR for exactly the amount
// due (scan with any UPI app) and the link to copy. Needs the gym's UPI ID.
export default function GymUpiPanel({ upiId, gymName, member, plan }) {
  const link = upiLink({ upiId, payeeName: gymName, amount: plan.due, note: `${plan.planName} - ${member.name}` });
  const [drawn, setDrawn] = useState({ link: '', url: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    if (link) qrDataUrl(link).then((url) => { if (live) setDrawn({ link, url }); });
    return () => { live = false; };
  }, [link]);

  // A QR drawn for an older link (the amount changed) is never shown.
  const qr = drawn.link === link ? drawn.url : '';

  if (!link) {
    return <p className="gx-sub">Add your UPI ID in Settings to get a pay link and QR code for {member.name}.</p>;
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <div className="gx-row" style={{ alignItems: 'flex-start', justifyContent: 'flex-start', gap: 16 }}>
      {qr ? <img src={qr} width={160} height={160} alt={`UPI QR code to collect ${rupees(plan.due)} from ${member.name}`} /> : <div style={{ width: 160, height: 160 }} aria-hidden="true" />}
      <div>
        <div className="gx-name">Collect {rupees(plan.due)} on UPI</div>
        <p className="gx-sub">Scan with any UPI app · pays {upiId.trim()}</p>
        <button type="button" className="gx-btn gx-btn-soft" onClick={copy}>{copied ? 'Link copied' : 'Copy pay link'}</button>
      </div>
    </div>
  );
}
