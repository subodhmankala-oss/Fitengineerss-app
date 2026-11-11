// UPI pay links and QR codes for the gym's "payment due" reminders. Pure link
// building plus a lazily-loaded QR renderer (kept out of the main bundle).

// Same rule as the database CHECK and the admin-write handler.
export const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,32}$/;
export const isValidUpiId = (id) => UPI_RE.test(String(id || '').trim());

// upi://pay?pa=<id>&pn=<gym>&am=<amount>&cu=INR&tn=<note>
// The payee address stays as typed (apps expect a plain "name@bank"); every
// other value is percent-encoded. Returns '' when there is no valid UPI ID.
export function upiLink({ upiId, payeeName, amount, note }) {
  const id = String(upiId || '').trim();
  if (!isValidUpiId(id)) return '';
  const parts = [`pa=${id}`];
  if (payeeName) parts.push(`pn=${encodeURIComponent(String(payeeName).slice(0, 60))}`);
  const rupees = Number(amount);
  if (Number.isFinite(rupees) && rupees > 0) parts.push(`am=${rupees.toFixed(2)}`);
  parts.push('cu=INR');
  if (note) parts.push(`tn=${encodeURIComponent(String(note).slice(0, 50))}`);
  return `upi://pay?${parts.join('&')}`;
}

// PNG data URL of a QR for `text`, or '' if it could not be drawn.
export async function qrDataUrl(text) {
  if (!text) return '';
  try {
    const QR = await import('qrcode');
    return await (QR.toDataURL || QR.default.toDataURL)(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}
