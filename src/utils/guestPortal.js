/**
 * guestPortal.js — shared helper for normalising a stored guest-portal URL
 * (whatever the raw stored value looks like) into the canonical
 * https://guest.drivedobias.com/{bookingId} form.
 */
export function normalisePortalUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const bookingId = u.pathname.replace(/^\//, "").split("/").pop();
    if (!bookingId) return raw;
    return `https://guest.drivedobias.com/${bookingId}`;
  } catch {
    return raw;
  }
}
