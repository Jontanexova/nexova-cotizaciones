:root {
  --teal-900: #0b3f3a;
  --teal-800: #0d544e;
  --teal-700: #0F766E;
  --teal-600: #0D9488;
  --teal-500: #14B8A6;
  --teal-300: #5EEAD4;
  --teal-100: #CCFBF1;
  --teal-50: #F0FDF9;

  --ink-950: #0B1220;
  --ink-900: #0F172A;
  --ink-800: #1E293B;
  --ink-700: #334155;
  --ink-600: #475569;
  --ink-500: #64748B;
  --ink-400: #94A3B8;
  --ink-300: #CBD5E1;
  --ink-200: #E2E8F0;
  --ink-100: #F1F5F9;
  --ink-50: #F8FAFC;

  --accent: #F59E0B;
  --accent-soft: #FEF3C7;
  --danger: #DC2626;
  --danger-soft: #FEE2E2;
  --success: #059669;
  --success-soft: #D1FAE5;

  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, .05);
  --shadow: 0 4px 14px rgba(15, 23, 42, .06), 0 1px 2px rgba(15, 23, 42, .04);
  --shadow-lg: 0 18px 48px -12px rgba(15, 23, 42, .22), 0 4px 12px rgba(15, 23, 42, .08);
  --shadow-teal: 0 10px 30px -10px rgba(15, 118, 110, .45);

  --font-display: 'Sora', system-ui, sans-serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  background: var(--ink-50);
  color: var(--ink-900);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
body { font-size: 14px; line-height: 1.5; }

#root { min-height: 100vh; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--ink-200); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--ink-300); }

/* Logo */
.nx-logo { display: inline-flex; align-items: center; gap: 10px; }
.nx-mark {
  width: 32px; height: 32px; border-radius: 8px;
  background: linear-gradient(135deg, var(--teal-700), var(--teal-600));
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 2px 8px rgba(15,118,110,.35);
  position: relative;
}
.nx-mark svg { display: block; }
.nx-wordmark {
  font-family: var(--font-display);
  font-weight: 800; letter-spacing: .14em;
  font-size: 15px; color: var(--ink-900);
}
.nx-subtle {
  font-family: var(--font-display);
  font-weight: 500; letter-spacing: .22em;
  font-size: 9px; color: var(--ink-400);
  text-transform: uppercase;
  display: block; margin-top: 2px;
}
.nx-logo--light .nx-wordmark { color: white; }
.nx-logo--light .nx-subtle { color: rgba(255,255,255,.55); }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: none; cursor: pointer;
  font-family: var(--font-body); font-weight: 600; font-size: 13.5px;
  padding: 10px 18px;
  border-radius: var(--radius);
  transition: all .18s;
  white-space: nowrap;
}
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn svg { width: 16px; height: 16px; stroke-width: 2.2; }
.btn-primary { background: var(--teal-700); color: white; box-shadow: var(--shadow-teal); }
.btn-primary:hover:not(:disabled) { background: var(--teal-800); transform: translateY(-1px); }
.btn-ghost { background: transparent; color: var(--ink-700); border: 1px solid var(--ink-200); }
.btn-ghost:hover:not(:disabled) { background: var(--ink-100); border-color: var(--ink-300); }
.btn-soft { background: var(--teal-50); color: var(--teal-700); border: 1px solid var(--teal-100); }
.btn-soft:hover:not(:disabled) { background: var(--teal-100); }
.btn-danger { background: var(--danger-soft); color: var(--danger); }
.btn-danger:hover:not(:disabled) { background: var(--danger); color: white; }
.btn-sm { padding: 7px 12px; font-size: 12.5px; }
.btn-lg { padding: 13px 24px; font-size: 14.5px; }

/* Inputs */
.nx-field { display: flex; flex-direction: column; gap: 6px; }
.nx-label { font-size: 12px; font-weight: 600; color: var(--ink-700); letter-spacing: .02em; }
.nx-hint { font-size: 11.5px; color: var(--ink-500); }
.nx-input, .nx-select, .nx-textarea {
  width: 100%;
  background: white;
  border: 1px solid var(--ink-200);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13.5px;
  color: var(--ink-900);
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.nx-input:focus, .nx-select:focus, .nx-textarea:focus {
  border-color: var(--teal-600);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, .12);
}
.nx-textarea { resize: vertical; min-height: 90px; font-family: inherit; }
.nx-select {
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 34px;
}

/* Card */
.nx-card {
  background: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--ink-200);
  box-shadow: var(--shadow-sm);
}
.nx-card-padded { padding: 22px; }

/* Badge */
.nx-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11.5px; font-weight: 600;
}
.chip-teal { background: var(--teal-50); color: var(--teal-700); border: 1px solid var(--teal-100); }
.chip-amber { background: var(--accent-soft); color: #B45309; border: 1px solid #FDE68A; }
.chip-slate { background: var(--ink-100); color: var(--ink-700); border: 1px solid var(--ink-200); }
.chip-success { background: var(--success-soft); color: var(--success); border: 1px solid #A7F3D0; }
.chip-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid #FECACA; }

/* Utility */
.h-display { font-family: var(--font-display); letter-spacing: -.015em; }
.mono { font-family: var(--font-mono); }
.hairline { border-top: 1px solid var(--ink-200); }
.fade-in { animation: fade .3s ease both; }
@keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Focus ring */
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, .3);
  border-radius: var(--radius);
}

/* Spinner */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--ink-200);
  border-top-color: var(--teal-700);
  border-radius: 999px;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Empty state */
.empty-state {
  padding: 48px 20px; text-align: center; color: var(--ink-500);
}
