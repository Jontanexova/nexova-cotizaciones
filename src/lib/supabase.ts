import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son requeridas.'
  );
}

// Nota: no pasamos generic <Database> para evitar fricciones con los tipos
// inferidos de Supabase v2. El casting tipado se hace en /lib/db.ts
// Configuración mínima con defaults seguros de Supabase:
// - persistSession/autoRefreshToken activados (comportamiento esperado)
// - detectSessionInUrl desactivado (no usamos OAuth redirects)
// - Sin flowType ni storageKey custom para maximizar compatibilidad
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
