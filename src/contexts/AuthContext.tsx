import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Vendor } from '../lib/types';

/**
 * AuthContext es la fuente única de verdad sobre la identidad del usuario.
 *
 * Ciclo de vida:
 *  - Al montar, leemos la sesión persistida y cargamos el vendor una sola vez.
 *  - onAuthStateChange atiende solo SIGNED_IN / SIGNED_OUT. Los eventos
 *    TOKEN_REFRESHED, USER_UPDATED e INITIAL_SESSION no cambian la identidad
 *    del usuario, así que no re-disparamos la carga del vendor (evita bugs
 *    de re-fetch redundante que antes causaban logouts falsos).
 *  - signOut es el único camino explícito para limpiar vendor.
 */

interface AuthContextValue {
  vendor: Vendor | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshVendor: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadVendorFor(userId: string): Promise<Vendor | null> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[Auth] Error cargando vendor:', error);
    return null;
  }
  return (data as Vendor) || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Bootstrap: una sola lectura de sesión + carga de vendor.
    (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (userId) {
        const v = await loadVendorFor(userId);
        if (mounted) setVendor(v);
      }
      if (mounted) setLoading(false);
    })();

    // Suscripción a cambios. Solo actuamos en SIGNED_IN y SIGNED_OUT para evitar
    // re-fetchs innecesarios en TOKEN_REFRESHED (Supabase refresca JWT en segundo
    // plano cada ~55 min; la identidad del usuario no cambia).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (mounted) setVendor(null);
        return;
      }
      if (event === 'SIGNED_IN' && session?.user) {
        loadVendorFor(session.user.id).then((v) => {
          if (mounted) setVendor(v);
        });
        return;
      }
      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, PASSWORD_RECOVERY:
      // no hacer nada. La identidad del usuario no cambió.
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange dispara SIGNED_IN y carga el vendor automáticamente.
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange dispara SIGNED_OUT y limpia el vendor.
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const refreshVendor = async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      setVendor(null);
      return;
    }
    const v = await loadVendorFor(userId);
    setVendor(v);
  };

  const isSuperAdmin = vendor?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{ vendor, loading, isSuperAdmin, signIn, signOut, changePassword, refreshVendor }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
