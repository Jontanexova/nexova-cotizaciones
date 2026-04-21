/**
 * v2.24: Contexto de branding (white-label).
 *
 * Carga la config de branding al bootstrap de la app e inyecta en runtime:
 *  - CSS variables para colores (`--brand-primary`, etc.)
 *  - `<link>` a Google Fonts según las tipografías elegidas
 *  - `<link rel="icon">` para favicon custom
 *  - Atributo data-theme en <html> para que los estilos puedan reaccionar
 *
 * Los componentes consumen via `useBranding()` y acceden a logos/nombre/tagline.
 * Si la config no cargó aún o falla, se usan los defaults de Nexova (fallback seguro).
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchBranding } from '../lib/db';
import type { BrandingSettings } from '../lib/types';

// Defaults de Nexova — fallback si no carga la config
const DEFAULT_BRANDING: BrandingSettings = {
  id: 'default',
  logo_main_url: null,
  logo_inverse_url: null,
  favicon_url: null,
  commercial_name: 'Nexova',
  tagline: 'Software Empresarial',
  color_primary: '#0F766E',
  color_secondary: '#0D9488',
  color_ink_dark: '#1E293B',
  color_bg_light: '#F4F6F8',
  color_success: '#16A34A',
  font_display: 'Sora',
  font_body: 'DM Sans',
  font_display_url: null,
  font_body_url: null,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

interface BrandingContextValue {
  branding: BrandingSettings;
  loading: boolean;
  /** Recargar branding desde DB (útil después de guardar cambios en Ajustes). */
  reload: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

/** Construye una URL de Google Fonts a partir del nombre de la family. */
function buildGoogleFontsUrl(displayFamily: string, bodyFamily: string, customDisplayUrl?: string | null, customBodyUrl?: string | null): string | null {
  // Si hay URLs custom, priorizarlas (el usuario puede traer fonts licenciadas)
  if (customDisplayUrl && customBodyUrl) return null; // se inyectan aparte
  if (customDisplayUrl || customBodyUrl) return null;

  const families = new Set<string>();
  if (displayFamily) families.add(displayFamily);
  if (bodyFamily && bodyFamily !== displayFamily) families.add(bodyFamily);
  if (families.size === 0) return null;

  const params = Array.from(families)
    .map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** Aplica las CSS variables al <html> para que todo el estilo reaccione. */
function applyCssVariables(b: BrandingSettings) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', b.color_primary);
  root.style.setProperty('--brand-secondary', b.color_secondary);
  root.style.setProperty('--brand-ink-dark', b.color_ink_dark);
  root.style.setProperty('--brand-bg-light', b.color_bg_light);
  root.style.setProperty('--brand-success', b.color_success);
  // Sobrescribir las CSS vars del tema de Nexova para que TODO use los nuevos colores sin refactor masivo
  root.style.setProperty('--teal-700', b.color_primary);
  root.style.setProperty('--teal-600', b.color_secondary);
  root.style.setProperty('--ink-900', b.color_ink_dark);
  // Tipografías
  root.style.setProperty('--brand-font-display', `'${b.font_display}', system-ui, sans-serif`);
  root.style.setProperty('--brand-font-body', `'${b.font_body}', system-ui, sans-serif`);
  root.style.setProperty('--font-display', `'${b.font_display}', system-ui, sans-serif`);
  root.style.setProperty('--font-body', `'${b.font_body}', system-ui, sans-serif`);
}

/** Inyecta (o reemplaza) el <link> de Google Fonts. */
function injectFonts(b: BrandingSettings) {
  const existingIds = ['brand-fonts-main', 'brand-fonts-display-custom', 'brand-fonts-body-custom'];
  existingIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // URLs custom (Foundry, self-hosted) — se inyectan directamente
  if (b.font_display_url) {
    const l = document.createElement('link');
    l.id = 'brand-fonts-display-custom';
    l.rel = 'stylesheet';
    l.href = b.font_display_url;
    document.head.appendChild(l);
  }
  if (b.font_body_url) {
    const l = document.createElement('link');
    l.id = 'brand-fonts-body-custom';
    l.rel = 'stylesheet';
    l.href = b.font_body_url;
    document.head.appendChild(l);
  }

  // Google Fonts para las selecciones estándar
  const ggUrl = buildGoogleFontsUrl(b.font_display, b.font_body, b.font_display_url, b.font_body_url);
  if (ggUrl) {
    const l = document.createElement('link');
    l.id = 'brand-fonts-main';
    l.rel = 'stylesheet';
    l.href = ggUrl;
    document.head.appendChild(l);
  }
}

/** Inyecta (o reemplaza) el <link rel="icon"> con el favicon custom. */
function injectFavicon(b: BrandingSettings) {
  if (!b.favicon_url) return;
  const existing = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (existing) {
    existing.href = b.favicon_url;
  } else {
    const l = document.createElement('link');
    l.rel = 'icon';
    l.href = b.favicon_url;
    document.head.appendChild(l);
  }
}

/** Actualiza el <title> con el nombre comercial. */
function applyTitle(b: BrandingSettings) {
  document.title = b.commercial_name
    ? `${b.commercial_name} · Panel comercial`
    : 'Panel comercial';
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((b: BrandingSettings) => {
    applyCssVariables(b);
    injectFonts(b);
    injectFavicon(b);
    applyTitle(b);
  }, []);

  const reload = useCallback(async () => {
    try {
      const b = await fetchBranding();
      if (b) {
        setBranding(b);
        apply(b);
      } else {
        apply(DEFAULT_BRANDING);
      }
    } catch (e) {
      console.warn('[BrandingContext] No se pudo cargar branding, usando defaults:', e);
      apply(DEFAULT_BRANDING);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reload]);

  return (
    <BrandingContext.Provider value={{ branding, loading, reload }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding debe usarse dentro de BrandingProvider');
  return ctx;
}
