# Nexova Cotizaciones — v2.26

**Fecha**: Abril 2026
**Tema**: Sección Clientes + validación RUC vía Edge Function

---

## Resumen ejecutivo

1. **Nueva sección "Clientes"** en el menú lateral (entre Panel y Nueva cotización).
   Directorio compartido: todos los vendedores ven todos los clientes.
2. **Validación RUC vía Decolecta** — botón "Validar" que autollena Razón Social
   y Dirección desde SUNAT. Funciona en el modal de Clientes y en el Wizard.
3. **Autocomplete de clientes en el Wizard** — el campo "Empresa / Razón social"
   ahora filtra clientes existentes mientras escribes y los autollena al
   seleccionar. Si no existe, se crea nuevo al guardar (como siempre).
4. **RUC arriba del formulario** en ambos lugares (Clientes y Wizard Step 1),
   para que el flujo natural sea "meto RUC → valido → resto se autollena".
5. **Seguridad del token Decolecta**: el token vive en `organization_settings.peruapi_key`
   y nunca sale al browser. Una nueva Edge Function `validate-ruc` lo usa
   server-side para consultar SUNAT.
6. **El mismo token de Decolecta cubre TC + RUC** — nota aclaratoria agregada
   en Ajustes → Integraciones. No necesitas configurar otro token.

---

## Deploy — pasos obligatorios en orden

### 1. Migración SQL — ✅ YA APLICADA EN PRODUCCIÓN

La migración `v2_26_clients_shared_directory` ya fue aplicada en tu proyecto
Supabase (`ukpoczrgndhkydpdrtvu`). No tienes que ejecutar nada.

Cambios que hizo:
- DROP policy `clients_seller_select` (filtraba por `owner_vendor_id = auth.uid()`)
- DROP policy `clients_owner_update`
- CREATE policy `clients_shared_select` — SELECT con `auth.uid() IS NOT NULL`
- CREATE policy `clients_shared_update` — UPDATE con `auth.uid() IS NOT NULL`
- Policies preservadas sin cambios: `clients_admin_all` (ALL, super_admin) y
  `clients_seller_insert` (INSERT, auth).
- Resultado: DELETE sigue restringido a super_admin. SELECT y UPDATE ahora
  abiertos a cualquier vendedor autenticado.

### 2. Desplegar la Edge Function `validate-ruc` — **TÚ DEBES CORRER ESTO**

La Edge Function vive en `supabase/functions/validate-ruc/index.ts` (ya
incluida en el ZIP). Desde la raíz del proyecto, con Supabase CLI autenticado:

```bash
# Si no tienes el CLI instalado:
npm install -g supabase

# Autenticarte (solo la primera vez):
supabase login

# Vincular el proyecto local a tu proyecto remoto (solo la primera vez):
supabase link --project-ref ukpoczrgndhkydpdrtvu

# Deploy la función:
supabase functions deploy validate-ruc
```

Verificación:
1. Entrar al dashboard Supabase → tu proyecto → Edge Functions.
2. Debe aparecer `validate-ruc` en estado "Active".
3. Probar desde la UI del dashboard con body `{ "ruc": "20605541231" }` (un RUC
   real cualquiera). Debe devolver `{ ok: true, razon_social: "...", ... }`.

**Importante**: la Edge Function lee el token de Decolecta desde la tabla
`organization_settings.peruapi_key`. Si no está configurado, devolverá error
claro. Verifica en Ajustes → Integraciones que el token esté guardado antes
de probar.

Variables de entorno: Supabase inyecta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
automáticamente al deployar. No tienes que configurar nada.

### 3. Desplegar el frontend a Vercel — **flujo normal**

```bash
# Desde la raíz del proyecto:
git add -A
git commit -m "v2.26: sección Clientes + validación RUC"
git push
# Vercel detecta el push y deploya automáticamente.
```

---

## Testing post-deploy

Checklist mínimo de 5 minutos:

1. **Sección Clientes aparece en el sidebar** entre "Panel" y "Nueva cotización".
2. **Abrir Clientes → click "Nuevo cliente"** → modal se abre con RUC arriba.
3. **Validar RUC**: meter un RUC real de 11 dígitos (ej. `20605541231`) → click
   "Validar" → debe autollenar Razón Social y Dirección. Si el RUC ya existe
   en tu BD, debe mostrar warning "ya registrado como {empresa}".
4. **Guardar cliente** → tabla se recarga y lo muestra arriba.
5. **Eliminar cliente**:
   - Como vendedor normal: el botón trash NO debe aparecer.
   - Como super_admin: sí debe aparecer. Si el cliente tiene cotizaciones,
     debe bloquear la eliminación con mensaje claro.
6. **Wizard de Nueva Cotización → Step 1**:
   - El campo "Empresa / Razón social" al escribir debe mostrar dropdown con
     sugerencias de clientes existentes.
   - Al seleccionar uno, todos los campos se autollenan y aparece banner
     "Cliente existente seleccionado" en teal.
   - Al editar cualquier campo, el banner desaparece (se desvincula y se
     creará como cliente nuevo al guardar).
   - Botón Validar RUC funciona igual que en Clientes.
7. **Ajustes → Integraciones**: ver la nota nueva en teal que aclara que el
   mismo token Decolecta cubre TC y RUC.

---

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `supabase/functions/validate-ruc/index.ts` | **NUEVO** — Edge Function |
| `src/lib/db.ts` | `fetchClientByRuc`, `updateClient`, `deleteClient`, `fetchClientsWithStats`, `validateRucViaEdgeFunction` con cache 5min |
| `src/pages/Clients.tsx` | **NUEVO** — listado, modal Nuevo/Editar, delete super_admin |
| `src/components/Sidebar.tsx` | Entry "Clientes" agregado |
| `src/App.tsx` | Ruteo a `view === 'clients'` |
| `src/pages/Wizard.tsx` | Step 1 rediseñado: RUC arriba, autocomplete, id opcional en ClientForm |
| `src/pages/SecondaryPages.tsx` | Nota en Integraciones sobre token compartido TC+RUC |

Migración SQL aplicada:
- `v2_26_clients_shared_directory` — relaja RLS para directorio compartido

---

## Consumo API Decolecta — estimado

Plan free de Decolecta: 1,000 peticiones/mes.

Consumo típico con v2.26:
- Auto-sync TC (cron): ~30/mes
- Al crear cotización (lee TC desde BD, no API): 0
- Validación RUC manual al crear cliente: depende de uso.
  Con cache de 5 min en frontend, golpes repetidos para el mismo RUC no
  cuentan.

Estimado realista: 30 + (clientes nuevos validados al mes) ≈ 100-400/mes
incluso con uso frecuente. Margen holgado en el plan free.

Para upgrade: WhatsApp +51 918 510 800 o dev@decolecta.com.

---

## Rollback

Si necesitas volver a v2.25.1:

1. **Frontend**: revertir el commit en git y redesplegar.
2. **Edge Function**: `supabase functions delete validate-ruc` (opcional —
   si no se llama, no hace daño quedarse instalada).
3. **RLS**: solo si quieres volver al modelo "cada vendedor ve los suyos":

   ```sql
   drop policy clients_shared_select on public.clients;
   drop policy clients_shared_update on public.clients;

   create policy clients_seller_select on public.clients
     for select
     using (
       owner_vendor_id = auth.uid()
       or exists (
         select 1 from quotes q
         where q.client_id = clients.id and q.vendor_id = auth.uid()
       )
     );

   create policy clients_owner_update on public.clients
     for update
     using (owner_vendor_id = auth.uid() or is_admin());

   notify pgrst, 'reload schema';
   ```

---

## Known caveats / pendientes futuros

- **Edge Function sin hot-reload**: si cambias `index.ts` en local, tienes que
  volver a correr `supabase functions deploy validate-ruc` para que tenga
  efecto. No hay watch-mode integrado.
- **Cache RUC solo en memoria**: se pierde al refrescar página. Un vendedor
  que valida el mismo RUC en dos sesiones distintas consume 2 requests.
  Si esto empieza a importar, se puede mover el cache a una tabla tipo
  `ruc_cache` con TTL server-side.
- **Sin lock de concurrencia**: si dos vendedores crean el mismo cliente al
  mismo tiempo con el mismo RUC, se crean dos registros. Un UNIQUE INDEX
  en `clients.ruc` resolvería esto, pero rompe clientes existentes sin RUC.
  Candidate para v2.27 con migración de data.
