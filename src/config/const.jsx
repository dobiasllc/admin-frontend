// API base URL — used by all API calls throughout the admin application.
const serverURL = process.env.REACT_APP_API_GATEWAY_URL || "http://localhost:8000";

// Alias used by admin pages (AdminGuestKeys, AdminBookingDetail, AdminMap, etc.)
const API_BASE_URL = serverURL;

export { serverURL, API_BASE_URL };
