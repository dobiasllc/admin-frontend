import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import AdminRoute from './components/AdminRoute';

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminBookings from './pages/AdminBookings';
import AdminBookingDetail from './pages/AdminBookingDetail';
import AdminCalendar from './pages/AdminCalendar';
import AdminUsers from './pages/AdminUsers';
import AdminVehicles from './pages/AdminVehicles';
import AdminMap from './pages/AdminMap';
import AdminGuestKeys from './pages/AdminGuestKeys';
import AdminCreateBooking from './pages/AdminCreateBooking';
import AdminPrintContract from './pages/AdminPrintContract';

function App() {
  return (
    // basename="/admin" means all routes below are relative to /admin
    // e.g. "/" here resolves to "/admin" in the browser
    <Router basename="/admin">
      <Routes>
        {/* ── Admin routes (fleet-admins Cognito group required) ─────────── */}
        <Route path="/"
          element={<AdminRoute><AdminDashboard /></AdminRoute>}
        />
        <Route path="/map"
          element={<AdminRoute><AdminMap /></AdminRoute>}
        />
        <Route path="/bookings"
          element={<AdminRoute><AdminBookings /></AdminRoute>}
        />
        <Route path="/bookings/new"
          element={<AdminRoute><AdminCreateBooking /></AdminRoute>}
        />
        {/* Draft contract preview — no booking ID, data from query params */}
        <Route path="/bookings/print-contract"
          element={<AdminRoute><AdminPrintContract /></AdminRoute>}
        />
        {/* Confirmed booking contract — fetches from API */}
        <Route path="/bookings/:id/print-contract"
          element={<AdminRoute><AdminPrintContract /></AdminRoute>}
        />
        <Route path="/bookings/:id"
          element={<AdminRoute><AdminBookingDetail /></AdminRoute>}
        />
        <Route path="/users"
          element={<AdminRoute><AdminUsers /></AdminRoute>}
        />
        <Route path="/vehicles"
          element={<AdminRoute><AdminVehicles /></AdminRoute>}
        />
        <Route path="/calendar"
          element={<AdminRoute><AdminCalendar /></AdminRoute>}
        />
        <Route path="/guest-keys"
          element={<AdminRoute><AdminGuestKeys /></AdminRoute>}
        />

        {/* ── Fallback: redirect everything to / (which is /admin) ─────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
