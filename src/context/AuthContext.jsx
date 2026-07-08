import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useAuth as useOIDCAuth } from "react-oidc-context";
import axios from 'axios';

const AuthContext = createContext();

// This hook is correct and ready to use in your components (e.g., Profile.jsx)
export const useApi = () => {
  const auth = useOIDCAuth();

  const authorizedApi = useMemo(() => {
    const instance = axios.create({
      baseURL: process.env.REACT_APP_API_GATEWAY_URL,
    });

    instance.interceptors.request.use((config) => {
      // Get the current token right when we need it
      // Always use id_token — it contains cognito:groups which the API requires for admin checks.
      // access_token does NOT contain group claims.
      const token = auth.user?.id_token || auth.user?.access_token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    return instance;
  }, [auth.user]); // Recreate this instance only when the user/token changes

  return authorizedApi;
};

export const AuthProvider = ({ children }) => {
  const auth = useOIDCAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!auth.isLoading && auth.user) {
      const name = auth.user.profile?.name || auth.user.profile?.email;
      if (name) {
        localStorage.setItem("user_display_name", name);
      }
    }
  }, [auth.isLoading, auth.user]);


  // Compute display name once OIDC is ready
  const displayName = useMemo(() => {
    if (auth.isLoading) {
      return localStorage.getItem("user_display_name") || "Loading...";
    }

    const name = auth.user?.profile?.name || auth.user?.profile?.given_name;
    const email = auth.user?.profile?.email;

    return name || email || "User";
  }, [auth.isLoading, auth.user]);


  // Login Logic
  const login = () => {
    localStorage.setItem("post_login_redirect", window.location.pathname);
    auth.signinRedirect();
  };

  // AWS Cognito Proprietary Logout (Required for Hosted UI)
  const logout = () => {
    setIsLoggingOut(true);
    auth.removeUser();

    const cognitoDomain = process.env.REACT_APP_COGNITO_AUTH_URL;
    const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID;
    const logoutUri = process.env.REACT_APP_REDIRECT_URI;

    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const value = useMemo(() => ({
    userProfile: auth.user?.profile,
    user: auth.user,
    isLoggedIn: auth.isAuthenticated,
    loading: auth.isLoading,
    login,
    logout,
    isLoggingOut,
    error: auth.error,
    displayName,
  }), [
    auth.user,
    auth.isAuthenticated,
    auth.isLoading,
    auth.error,
    isLoggingOut,
    displayName
  ]);


  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
