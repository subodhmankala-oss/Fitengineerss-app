// Phone is compulsory for every coach (see CoachPhoneGate). Numbers are
// stored as "+91XXXXXXXXXX"; a few older rows are a bare 10 digits.
//
// This is a format check, not proof the number is real — only an SMS code
// can prove that. It does stop the obvious fakes: Indian mobile numbers are
// 10 digits starting 6–9, so "1234567890", "0000000000" and the like fail.
const FAKE_SEQUENCES = ['1234567890', '0123456789', '9876543210'];

// The coach's 10-digit mobile number, or '' if the input has none — accepts
// "+91 98765 43210", "919876543210", "09876543210" or a bare 10 digits.
export const mobileDigits = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : '';
};

export const hasValidPhone = (phone) => {
  const d = mobileDigits(phone);
  if (!/^[6-9]\d{9}$/.test(d)) return false;
  if (/^(\d)\1{9}$/.test(d)) return false;
  return !FAKE_SEQUENCES.includes(d);
};

export const INVALID_PHONE_MESSAGE = 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).';
