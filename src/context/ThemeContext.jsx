/**
 * ThemeContext.jsx
 * Provides app-wide dark mode state, persisted server-side via /admin/settings
 * (backed by SSM Parameter Store), rather than localStorage.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth as useOIDCAuth } from 'react-oidc-context';
import { useApi } from './AuthContext';

const ThemeContext = createContext();

function applyClass(isDark) {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const ThemeProvider = ({ children }) => {
  const api = useApi();
  const oidc = useOIDCAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until OIDC auth has finished loading (and we have a real token)
    // before fetching settings — otherwise the request races the login flow
    // on page refresh, fails silently, and dark mode always resets to light.
    if (oidc.isLoading) return;
    if (!oidc.user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    api.get('/admin/settings')
      .then(r => {
        if (cancelled) return;
        const dm = !!r.data?.darkMode;
        setDarkMode(dm);
        applyClass(dm);
      })
      .catch(() => {
        // Default to light mode on error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidc.isLoading, oidc.user]);


  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      applyClass(next);
      api.put('/admin/settings', { darkMode: next }).catch(() => {
        // Revert on failure
        setDarkMode(prev);
        applyClass(prev);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  return (
    <ThemeContext.Provider value={{ darkMode, loading, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
