import { useState } from 'react';
import { BrowserRouter, Route, Routes, useParams, useNavigate, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loading } from './components/UI';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Wizard } from './pages/Wizard';
import { QuotePreview } from './pages/QuotePreview';
import { PublicLink } from './pages/PublicLink';
import { Products } from './pages/Products';
import { Users } from './pages/Users';
import { Vendors, Reports, Settings } from './pages/SecondaryPages';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/public/:token" element={<PublicRoute />} />
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
  const { vendor, loading, isSuperAdmin, signOut } = useAuth();
  const [view, setView] = useState<string>('dashboard');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loading label="Iniciando…" />
      </div>
    );
  }

  if (!vendor) return <Login />;

  if (wizardOpen) {
    return (
      <Wizard
        onCancel={() => setWizardOpen(false)}
        onFinish={(quoteId) => {
          setActiveQuoteId(quoteId);
          setWizardOpen(false);
        }}
      />
    );
  }

  if (activeQuoteId) {
    return <QuotePreview quoteId={activeQuoteId} onBack={() => setActiveQuoteId(null)} />;
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
        {(view === 'dashboard' || view === 'quotes') && (
          <Dashboard
            onOpenQuote={setActiveQuoteId}
            onNewQuote={() => setWizardOpen(true)}
          />
        )}
        {view === 'products' && <Products />}
        {view === 'vendors' && <Vendors />}
        {view === 'reports' && <Reports />}
        {view === 'users' && isSuperAdmin && <Users />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
