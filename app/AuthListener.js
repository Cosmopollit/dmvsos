'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getSavedLang } from '@/lib/lang';

export default function AuthListener({ children }) {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {});
    return () => subscription?.unsubscribe();
  }, []);

  // Set <html lang> to match saved language preference
  useEffect(() => {
    document.documentElement.lang = getSavedLang();
  }, []);

  return children;
}
