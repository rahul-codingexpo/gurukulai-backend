/** Normalize to WhatsApp digits: country code + national number (no + or spaces). */
export const normalizeWhatsAppPhone = (raw) => {
  if (raw === undefined || raw === null) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // UAE: 971 + 9 digits (12 total)
  // if (digits.startsWith("971") && digits.length === 12) {
  //   return digits;
  // }

  // India: 10-digit mobile → 91...
  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.startsWith("91") && digits.length === 12) {
    return digits;
  }

  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
};
