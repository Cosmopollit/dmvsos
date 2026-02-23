'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthListener({ children }) {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {});
    return () => subscription?.unsubscribe();
  }, []);

  return children;
}
