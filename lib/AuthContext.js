'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSavedLang } from './lang';

const AuthContext = createContext({ user: null, isPro: false, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set <html lang> from saved preference
    document.documentElement.lang = getSavedLang();

    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      const u = data?.session?.user ?? null;
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) setIsPro(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Fetch pro status when user changes
  useEffect(() => {
    if (!user?.email) {
      setIsPro(false);
      return;
    }
    supabase
      .from('profiles')
      .select('is_pro')
      .eq('email', user.email)
      .single()
      .then(({ data: profile }) => setIsPro(profile?.is_pro ?? false))
      .catch(() => setIsPro(false));
  }, [user?.email]);

  return (
    <AuthContext.Provider value={{ user, isPro, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
