import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { fetchCurrentVendor } from '../lib/db';
import type { Vendor } from '../lib/types';

interface AuthContextValue {
  vendor: Vendor | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<Vendor | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

  const loadVendor = async (isInitial = false) => {
    try {
      const v = await fetchCurrentVendor();
      setVendor(v);
      return v;
    } catch (e) {
      console.error('[Auth] loadVendor error:', e);
      // Solo limpiar vendor en el bootstrap inicial. En llamadas posteriores,
      // si hay un error pero ya había un vendor cargado, lo mantenemos en memoria
      // para evitar logouts espurios por timeout transitorio.
      if (isInitial) {
        setVendor(null);
      }
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Hard timeout del bootstrap: 20s. Si no completa, mostrar login (no quedarse en Iniciando)
    const hardTimeout = setTimeout(() => {
      if (mounted && !bootstrappedRef.current) {
        console.warn('[Auth] Timeout en inicialización — forzando loading=false');
        setLoading(false);
      }
    }, 20000);

    (async () => {
      try {
        await loadVendor(true); // isInitial=true → en error, setVendor(null)
      } catch (e) {
        console.error('[Auth] Init error:', e);
      } finally {
        clearTimeout(hardTimeout);
        bootstrappedRef.current = true;
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.debug('[Auth] event:', event, 'session:', session ? 'present' : 'null');

      // SIGNED_OUT explícito: único evento donde limpiamos vendor
      if (event === 'SIGNED_OUT') {
        console.info('[Auth] SIGNED_OUT recibido — limpiando vendor');
        setVendor(null);
        return;
      }

      // SIGNED_IN: login exitoso, cargar vendor (isInitial=false: no limpiar en error)
      if (event === 'SIGNED_IN') {
        console.debug('[Auth] SIGNED_IN — cargando vendor');
        await loadVendor(false).catch((e) => console.error('[Auth] loadVendor en SIGNED_IN error:', e));
        return;
      }

      // Resto de eventos (INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY):
      // NO tocar el estado del vendor. El JWT puede estar refrescándose o
      // el bootstrap ya lo manejó.
      console.debug('[Auth] Evento no-accionable:', event, '— manteniendo estado');
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
    await loadVendor(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setVendor(null);
  };

  const isSuperAdmin = vendor?.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ vendor, loading, isSuperAdmin, signIn, signOut, refresh: () => loadVendor(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
