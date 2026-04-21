/**
 * v2.25.1 — Vista pública de la cotización por token (lo que ve el cliente).
 *
 * Layout delegado a <QuoteDocument /> — el mismo componente que usa
 * QuotePreview para garantizar que lo que ve el vendedor en el preview es
 * EXACTAMENTE lo que verá el cliente al abrir el link. Aquí solo nos
 * encargamos de:
 *  - Fetch del quote, products y orgSettings desde Supabase por token público.
 *  - Registrar la vista (incrementQuoteView).
 *  - Armar el chrome de la página (card, padding, footer de atribución).
 */
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Loading } from '../components/UI';
import { QuoteDocument } from '../components/QuoteDocument';
import {
  fetchOrgSettings,
  fetchProductsWithModules,
  fetchQuoteByPublicToken,
  incrementQuoteView,
} from '../lib/db';
import { useBranding } from '../contexts/BrandingContext';
import type { OrganizationSettings, Product, Quote } from '../lib/types';

export function PublicLink({ token }: { token: string }) {
  const { branding } = useBranding();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [q, ps, org] = await Promise.all([
          fetchQuoteByPublicToken(token),
          fetchProductsWithModules(),
          fetchOrgSettings().catch(() => null),
        ]);
        setQuote(q);
        setProducts(ps);
        setOrgSettings(org);
        if (q) await incrementQuoteView(token);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <Loading label="Cargando cotización…" />;
  if (!quote) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ink-900)',
          color: 'white',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)' }}>Cotización no encontrada</h1>
          <p style={{ color: 'rgba(255,255,255,.6)' }}>
            El enlace no es válido o la cotización fue eliminada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, var(--ink-100), var(--ink-50) 30%)',
        padding: '40px 16px',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: 'white',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          padding: '48px 54px',
        }}
      >
        {/* Cuerpo del documento — compartido con QuotePreview (sin botones de edición). */}
        <QuoteDocument quote={quote} products={products} orgSettings={orgSettings} />

        {/* Footer de atribución — solo en el link público, no en el preview interno. */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: '0.5px solid var(--ink-200)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--ink-400)',
          }}
        >
          <div>
            <Icon name="sparkle" size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {[
              branding.commercial_name || orgSettings?.name || 'Nexova',
              orgSettings?.website,
              orgSettings?.phone,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)' }}>Cotización {quote.code}</div>
        </div>
      </div>
    </div>
  );
}
