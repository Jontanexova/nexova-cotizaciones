import { useState } from 'react';
import { BrowserRouter, Route, Routes, useParams, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loading } from './components/UI';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Quotes } from './pages/Quotes';
import { Wizard } from './pages/Wizard';
import { QuotePreview } from './pages/QuotePreview';
import { PublicLink } from './pages/PublicLink';
import { Products } from './pages/Products';
import { Users } from './pages/Users';
import { ResetPassword } from './pages/ResetPassword';
import { ForcePasswordChange } from './pages/ForcePasswordChange';
import { Vendors, Reports, Settings } from './pages/SecondaryPages';
import type { Quote } from './lib/types';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/public/:token" element={<PublicRoute />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function PublicRoute() {
  const { token } = useParams<{ token: string }>();
  if (!token) return <Navigate to="/" />;
  return <PublicLink token={token} />;
}

// ─── App shell (auth gate) ───
function AppShell() {
  const { vendor, loading, isSuperAdmin, isAdmin, signOut } = useAuth();
  const [view, setView] = useState<string>('dashboard');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loading label="Iniciando…" />
      </div>
    );
  }

  if (!vendor) return <Login />;

  // Si el usuario usa una contraseña temporal, forzar cambio antes de seguir.
  if (vendor.must_change_password) return <ForcePasswordChange />;

  if (wizardOpen || editingQuote) {
    return (
      <Wizard
        quote={editingQuote}
        onCancel={() => {
          setWizardOpen(false);
          setEditingQuote(null);
        }}
        onFinish={(quoteId) => {
          setWizardOpen(false);
          setEditingQuote(null);
          setActiveQuoteId(quoteId);
        }}
      />
    );
  }

  if (activeQuoteId) {
    return (
      <QuotePreview
        quoteId={activeQuoteId}
        onBack={() => setActiveQuoteId(null)}
        onEditQuote={(q) => {
          setActiveQuoteId(null);
          setEditingQuote(q);
        }}
      />
    );
  }

  const handleNavigate = (key: string) => {
    if (key === 'new') setWizardOpen(true);
    else setView(key);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar current={view} onNavigate={handleNavigate} user={vendor} onLogout={handleLogout} />
      <main style={{ flex: 1, minWidth: 0, background: 'var(--ink-50)' }}>
        {view === 'dashboard' && (
          <Dashboard
            onOpenQuote={setActiveQuoteId}
            onNewQuote={() => setWizardOpen(true)}
          />
        )}
        {view === 'quotes' && (
          <Quotes
            onOpenQuote={setActiveQuoteId}
            onNewQuote={() => setWizardOpen(true)}
            onEditQuote={(q) => setEditingQuote(q)}
          />
        )}
        {view === 'products' && <Products />}
        {view === 'vendors' && <Vendors />}
        {view === 'reports' && <Reports />}
        {view === 'users' && isAdmin && <Users />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
