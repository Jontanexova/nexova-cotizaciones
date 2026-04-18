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
      console.error('[Auth] loadVendor error:', e);
      setVendor(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Hard timeout: si la inicialización no completa en 8s, forzar loading=false
    // para que el usuario al menos vea la pantalla de login en vez de quedarse "Iniciando..."
    const hardTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Timeout en inicialización — forzando loading=false');
        setLoading(false);
      }
    }, 8000);

    (async () => {
      try {
        await loadVendor();
      } catch (e) {
        console.error('[Auth] Init error:', e);
      } finally {
        clearTimeout(hardTimeout);
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      // SIGNED_OUT: limpia el vendor
      if (event === 'SIGNED_OUT') {
        setVendor(null);
        return;
      }
      // SIGNED_IN / INITIAL_SESSION: cargar perfil del vendor
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        await loadVendor().catch((e) => console.error('[Auth] state change error:', e));
        return;
      }
      // TOKEN_REFRESHED / USER_UPDATED: el JWT se refrescó pero la identidad del
      // usuario no cambió → NO re-consultar vendor. Hacerlo puede causar falsos
      // positivos de "sesión vacía" durante la transición del token y loggear al
      // usuario afuera justo después de un save exitoso.
      if (event === 'TOKEN_REFRESHED') {
        console.debug('[Auth] token refreshed, keeping vendor state');
      }
    });

    return () => {
      mounted = false;
      clearTimeout(hardTimeout);
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
