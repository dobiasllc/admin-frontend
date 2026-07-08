/**
 * ProtectedRoute.jsx
 * Wraps routes that require Cognito authentication.
 * Redirects to login if not authenticated.
 */
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isLoggedIn, loading, login } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    // Save intended destination so we can redirect back after login
    localStorage.setItem('post_login_redirect', location.pathname + location.search);
    login();
    return null; // login() triggers redirect — render nothing while redirecting
  }

  return children;
}
