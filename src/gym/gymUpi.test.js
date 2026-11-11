import { describe, it, expect } from 'vitest';
import { isValidUpiId, upiLink, qrDataUrl } from './gymUpi';

describe('gymUpi', () => {
  it('accepts normal UPI IDs and rejects junk', () => {
    ['irondenfit@okhdfcbank', 'iron.den-1@ybl', '9876543210@paytm'].forEach((id) => expect(isValidUpiId(id)).toBe(true));
    ['', 'nobody', '@ybl', 'a@b', 'has space@ybl', 'x@1bank', 'a&b=c@ybl'].forEach((id) => expect(isValidUpiId(id)).toBe(false));
  });

  it('builds a pay link with the amount, payee and note encoded', () => {
    const link = upiLink({ upiId: 'irondenfit@okhdfcbank', payeeName: 'Iron Den & Co', amount: 1500, note: 'Monthly plan - Ravi' });
    expect(link).toBe('upi://pay?pa=irondenfit@okhdfcbank&pn=Iron%20Den%20%26%20Co&am=1500.00&cu=INR&tn=Monthly%20plan%20-%20Ravi');
  });

  it('leaves out an unusable amount, and gives no link without a valid UPI ID', () => {
    expect(upiLink({ upiId: 'a.b@ybl', amount: 0 })).toBe('upi://pay?pa=a.b@ybl&cu=INR');
    expect(upiLink({ upiId: '', amount: 100 })).toBe('');
    expect(upiLink({ upiId: 'bad id@ybl', amount: 100 })).toBe('');
  });

  it('renders a QR as a PNG data URL', async () => {
    const url = await qrDataUrl('upi://pay?pa=a.b@ybl&am=100.00&cu=INR');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(await qrDataUrl('')).toBe('');
  });
});
