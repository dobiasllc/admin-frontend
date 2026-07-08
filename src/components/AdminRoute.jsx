/**
 * AdminRoute.jsx
 * Wraps routes that require membership in the 'fleet-admins' Cognito group.
 * Redirects non-admins to an access denied screen.
 *
 * Cognito adds group membership to the access token under the
 * "cognito:groups" claim (array of group names).
 */
import { useAuth } from '../context/AuthContext';

/**
 * Check if the authenticated user belongs to the fleet-admins group.
 * Works with both access_token and id_token JWT claims.
 */
function isAdmin(user) {
  if (!user) return false;

  // react-oidc-context exposes decoded profile from id_token
  const profile = user.profile || {};

  // Cognito puts groups in "cognito:groups" claim
  const groups =
    profile['cognito:groups'] ||
    profile['custom:groups'] ||
    [];

  return Array.isArray(groups) && groups.includes('fleet-admins');
}

export default function AdminRoute({ children }) {
  const { isLoggedIn, loading, login, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Checking permissions…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    login();
    return null;
  }

  if (!isAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-6">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-6">
            You don't have permission to access the admin area. This portal requires membership in the <strong>fleet-admins</strong> group.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
