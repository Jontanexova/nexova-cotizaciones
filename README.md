# Nexova · Sistema de Cotizaciones

Sistema de generación de cotizaciones comerciales con autenticación real, base de datos y links públicos para clientes.

Stack: **React 18 + TypeScript + Vite + Supabase (Postgres + Auth + RLS) + Vercel**.

## 🎭 Roles del sistema (v1.1)

| Rol | Accesos |
|---|---|
| **Super Admin** | Acceso total — todos los paneles, gestión de usuarios, edición de datos de la empresa |
| **Vendedor** (`seller`) | Panel, Cotizaciones propias, Productos, Vendedores, Reportes. **No ve** Usuarios ni Ajustes |
| **Vendedor externo** (`external`) | Igual que Vendedor |

- El registro público está **deshabilitado**. Solo un Super Admin puede crear usuarios desde el panel "Usuarios"
- Al crear un usuario, el sistema genera una contraseña aleatoria que se muestra **una sola vez** en un modal
- Super Admin puede: crear usuarios, cambiar roles, resetear contraseñas, eliminar usuarios

---

## 🚀 Quickstart (desarrollo local)

```bash
npm install
npm run dev
```

Abrir http://localhost:5173.

El archivo `.env.local` ya está preconfigurado apuntando al proyecto Supabase de producción.

Para cambiar a otro proyecto, editar `.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

---

## 🏗️ Estructura

```
src/
├── main.tsx                 # Entry point (React 18 root)
├── App.tsx                  # Router + AuthProvider + AppShell
├── styles.css               # Design system (CSS vars, utility classes)
├── vite-env.d.ts            # Types de env vars
│
├── lib/
│   ├── supabase.ts          # Cliente Supabase singleton
│   ├── types.ts             # Tipos TS + Database schema
│   ├── db.ts                # Queries (fetchQuotes, createQuote, publishQuote, ...)
│   └── utils.ts             # fmtMoney, fmtDate, computeQuoteTotals, STATUS_MAP
│
├── contexts/
│   └── AuthContext.tsx      # Sesión Supabase + perfil vendor
│
├── hooks/
│   ├── useProducts.ts
│   ├── useQuotes.ts
│   └── useVendors.ts
│
├── components/
│   ├── Icon.tsx             # Sistema de iconos inline SVG
│   ├── UI.tsx               # NexovaLogo, Avatar, Stat, StatusChip, Modal, Topbar, Loading, Toast
│   └── Sidebar.tsx
│
└── pages/
    ├── Login.tsx            # Signin / signup con Supabase Auth
    ├── Dashboard.tsx        # Lista de cotizaciones + métricas + insights
    ├── Wizard.tsx           # 4 pasos: cliente → requerimientos → IA → revisión
    ├── QuotePreview.tsx     # Preview + publicar + cambiar estado
    ├── PublicLink.tsx       # Vista pública sin auth (por token)
    ├── Products.tsx         # Catálogo read-only
    └── SecondaryPages.tsx   # Vendors + Reports + Settings
```

---

## 🗄️ Base de datos

El proyecto Supabase ya tiene las migraciones aplicadas. Schema:

- **vendors** — perfil extendido de `auth.users` (role: admin / seller / external)
- **products** + **product_modules** — catálogo con módulos opcionales y precios recurrentes
- **clients** — con scoping por vendedor vía `owner_vendor_id`
- **quotes** — header con código `NX-YYYY-NNNN`, `public_token` para links compartibles
- **quote_items** + **quote_item_modules** — líneas de cotización y módulos seleccionados

Funciones RPC:
- `next_quote_code()` — genera códigos secuenciales por año
- `is_admin()` — helper para policies
- `increment_quote_view(p_token)` — incrementa contador de vistas del link público

**Row Level Security** activo en todas las tablas:
- **Admin**: ve y modifica todo
- **Seller / External**: solo sus cotizaciones y clientes asignados
- **Productos y módulos**: lectura pública (para links públicos) + escritura solo admin

---

## 👤 Primer uso

1. Abrir la app
2. Click en "¿Primera vez? Crear cuenta nueva"
3. Registrar email + contraseña + nombre
4. El trigger `handle_new_user` crea automáticamente el registro en `vendors` con rol `seller`

### Promover un usuario a admin

El primer usuario se crea como `seller`. Para promoverlo a admin, ejecutar en el SQL Editor de Supabase:

```sql
update public.vendors
set role = 'admin'
where email = 'tu@email.com';
```

---

## 🌐 Deploy

### Vercel (recomendado)

1. Subir el proyecto a GitHub (ver sección abajo)
2. En Vercel: New Project → Import del repo
3. Vercel detecta Vite automáticamente (Framework Preset: Vite)
4. Environment variables:
   ```
   VITE_SUPABASE_URL=https://ukpoczrgndhkydpdrtvu.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_sda3hRY8s3vtnnvEe23HqA_Eh8yQdtq
   ```
5. Deploy

El archivo `vercel.json` ya tiene los rewrites configurados para que las rutas del SPA (`/public/:token`) funcionen.

### Configurar Auth en Supabase después del deploy

Una vez que Vercel te dé la URL (ej. `nexova-cotizaciones.vercel.app`):

1. Ir a Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**: `https://tu-dominio.vercel.app`
3. **Redirect URLs**: agregar `https://tu-dominio.vercel.app/**`
4. (Opcional) Deshabilitar "Confirm email" si quieres registros sin confirmación por email (Auth → Providers → Email → Confirm email = OFF)

---

## 📤 Push a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial commit: Nexova Cotizaciones v1.0"
git branch -M main
git remote add origin git@github.com:TU-USUARIO/nexova-cotizaciones.git
git push -u origin main
```

> **Importante**: el archivo `.env.local` está en `.gitignore` y NO se subirá. Tus credenciales Supabase quedan locales. Para producción, configura las env vars en Vercel (instrucciones arriba).

---

## 🧪 Build de producción local

```bash
npm run build
npm run preview
```

Abre en http://localhost:4173 para ver el build optimizado.

---

## 🔐 Seguridad

- **Publishable key** en el frontend es segura: las policies RLS controlan el acceso a nivel de fila.
- **Nunca** commits con `.env.local` — el `.gitignore` ya lo protege.
- Para cambios de schema, usar migraciones SQL (no editar tablas desde el UI de Supabase).

---

## 📋 Roadmap (próximos pasos)

- [ ] Export de cotización a PDF (jsPDF)
- [ ] Notificaciones por email al publicar (via Supabase Edge Function + Resend)
- [ ] CRUD de productos desde la UI (solo admin)
- [ ] Branding de cotizaciones personalizable (logo, colores por organización)
- [ ] Búsqueda avanzada de cotizaciones con filtros de fecha y monto
- [ ] Duplicar cotización existente

---

Proyecto generado con Claude como asistente técnico. Stack y schema diseñados para escalar a decenas de usuarios sin cambios.
