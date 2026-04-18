import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { fetchCurrentVendor } from '../lib/db';
import type { Vendor } from '../lib/types';

interface AuthContextValue {
  vendor: Vendor | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVendor = async () => {
    try {
      const v = await fetchCurrentVendor();
      setVendor(v);
    } catch (e) {
      console.error('loadVendor error', e);
      setVendor(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadVendor();
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, _session) => {
      await loadVendor();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadVendor();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setVendor(null);
  };

  const isSuperAdmin = vendor?.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ vendor, loading, isSuperAdmin, signIn, signOut, refresh: loadVendor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
