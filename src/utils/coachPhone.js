// Phone is compulsory for every coach (see CoachPhoneGate). Numbers are
// stored as "+91XXXXXXXXXX", so "valid" just means at least 10 digits.
export const hasValidPhone = (phone) => (phone || '').replace(/\D/g, '').length >= 10;
