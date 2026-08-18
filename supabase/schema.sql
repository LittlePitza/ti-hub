-- ============================================================
-- TI Hub · database schema
-- Paste the whole file into: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- EMPLOYEES ----------
-- The assignment key: each employee is identified by their email (unique);
-- inventory and the portal both link devices and tickets to that email.
create table if not exists empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null unique,
  departamento text,
  puesto text,
  extension text,
  estado text not null default 'activo' check (estado in ('activo','baja')),
  created_at timestamptz not null default now()
);

-- ---------- INVENTORY ----------
-- A single table for the whole inventory, partitioned by `categoria`:
--   computo  -> laptops, desktops, monitors, printers, network gear, servers, peripherals
--   celular  -> smartphones and tablets (num_serie = IMEI, telefono = the line it carries)
--   linea    -> phone lines (telefono = number, marca = carrier, modelo = plan);
--               a line with no asignado_email is "free"
--   software -> licences (marca = vendor, modelo = version/plan, num_serie = key,
--               garantia_hasta = renewal date)
create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'computo'
    check (categoria in ('computo','celular','linea','software')),
  tipo text not null default 'laptop'
    check (tipo in ('laptop','desktop','monitor','impresora','red','servidor','perifericos','otro',
                    'celular','tablet','linea','software')),
  marca text,
  modelo text,
  num_serie text,
  telefono text, -- the line number (categories celular and linea)
  asignado_a text,
  asignado_email text, -- employee email (empleados.correo); links their devices in the portal
  ubicacion text,
  estado text not null default 'activo'
    check (estado in ('activo','en_reparacion','almacen','baja')),
  fecha_compra date,
  garantia_hasta date,
  notas text,
  -- device credentials and access details (RustDesk, local admin and others).
  -- shape: { rustdesk:{id,pass}, admin:{usuario,pass}, extra:[{etiqueta,usuario,secreto}] }
  -- IT PANEL ONLY: never select this column from the employee portal.
  accesos jsonb not null default '{}'::jsonb,
  -- values of the per-category custom fields (see the campos_inventario table).
  -- shape: { [clave]: value }. IT PANEL ONLY: do not select from the portal.
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- INVENTORY CUSTOM FIELDS ----------
-- Definitions editable from /ti/inventario/configuracion: IT adds new fields
-- per category without touching code. The captured values live in
-- equipos.extras ({ [clave]: value }); this table is only the field catalogue.
create table if not exists campos_inventario (
  id uuid primary key default gen_random_uuid(),
  categoria text not null
    check (categoria in ('computo','celular','linea','software')),
  clave text not null,                 -- stable slug; the key inside equipos.extras
  etiqueta text not null,              -- what IT sees ("N° de serie")
  tipo text not null default 'texto'
    check (tipo in ('texto','numero','fecha','opciones','booleano')),
  opciones jsonb not null default '[]'::jsonb,  -- for tipo 'opciones': ["A","B"]
  placeholder text,
  requerido boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (categoria, clave)
);

-- ---------- MAINTENANCE ----------
create table if not exists mantenimientos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid references equipos(id) on delete set null,
  titulo text not null,
  tipo text not null default 'preventivo' check (tipo in ('preventivo','correctivo')),
  fecha_programada date not null,
  responsable text,
  estado text not null default 'programado'
    check (estado in ('programado','en_proceso','completado','cancelado')),
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- TICKETS ----------
-- Help-desk lifecycle (Jira-like):
--   abierto -> en_proceso <-> en_espera -> archivado ; reabierto rejoins the flow.
--   `archivado` is the terminal status: on resolution the ticket is archived and leaves
--   the active board. (resuelto/cerrado remain allowed for compatibility with older
--   data and the activity log, but the current flow archives directly.)
-- Service times: `primera_respuesta_at` (first contact from IT) and `resuelto_at`
--   (transition to resolved/closed) allow measuring response and resolution against the
--   per-priority SLA defined in `lib/domain/tickets.ts`.
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  num serial,
  titulo text not null,
  descripcion text,
  solicitante text not null,
  solicitante_email text,                                    -- employee email (portal)
  equipo_id uuid references equipos(id) on delete set null,  -- the related device (portal)
  categoria text not null default 'hardware'
    check (categoria in ('hardware','software','red','accesos','correo','otro')),
  prioridad text not null default 'media'
    check (prioridad in ('baja','media','alta','critica')),
  estado text not null default 'abierto'
    check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto','archivado')),
  asignado_a text,
  asignado_email text,                -- email of the IT technician responsible (optional)
  primera_respuesta_at timestamptz,   -- first contact from IT; the basis of response time
  resuelto_at timestamptz,            -- transition to resolved/closed; the basis of resolution time
  adjuntos jsonb not null default '[]'::jsonb, -- report photos (portal): [{path,nombre,tipo}] in the 'tickets' bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- TICKET ACTIVITY LOG ----------
-- Per-ticket history: internal IT comments, status changes, reassignments, system events
-- (creation, edits), `respuesta` (a message from IT to the requester) and
-- `mensaje_cliente` (the reply the requester writes from the portal).
-- Almost all of it is internal (RLS `to authenticated`); the employee portal reads and
-- writes only `respuesta` and `mensaje_cliente` (filtered by their email via the service
-- role) to render the thread.
create table if not exists ticket_eventos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tipo text not null default 'comentario'
    check (tipo in ('comentario','estado','asignacion','sistema','respuesta','mensaje_cliente')),
  autor text,                -- email or name of whoever produced the event
  cuerpo text,               -- the comment text, or the detail of the change
  estado_anterior text,
  estado_nuevo text,
  created_at timestamptz not null default now()
);

-- ---------- EMAIL CONFIGURATION ----------
-- A single row (id = 1) holding the SMTP settings and the requester notification
-- templates. Managed from the panel (/ti/correo), not through environment variables.
-- IT triggers the send on demand (not automatic). Only authenticated users read or
-- write it (RLS).
create table if not exists config_correo (
  id int primary key default 1 check (id = 1),
  activo boolean not null default false,
  -- Send method: basic SMTP (legacy), app-only Graph, or interactive OAuth login.
  metodo text not null default 'smtp_basico'
    check (metodo in ('smtp_basico','graph_app','oauth_interactivo')),
  smtp_host text not null default 'smtp.office365.com',
  smtp_port int not null default 587,
  smtp_user text,
  smtp_pass text,
  -- OAuth2 / Microsoft Entra ID (Azure) credentials for graph_app and oauth_interactivo.
  azure_tenant_id text,
  azure_client_id text,
  azure_client_secret text,
  oauth_refresh_token text,            -- oauth_interactivo only: the refresh token
  oauth_cuenta text,                   -- email of the connected account (for display)
  remitente text,
  remitente_nombre text not null default 'Soporte TI · Plásticos PIMSA',
  sitio_url text,
  notif_respuesta_def boolean not null default true,  -- checkbox pre-ticked when replying
  notif_estado_def boolean not null default false,    -- checkbox pre-ticked when changing status
  -- Internal notice to IT when a new ticket arrives from the employee portal.
  notif_nuevo boolean not null default true,
  notif_nuevo_destinos text,                          -- destination addresses (comma or newline separated)
  asunto_nuevo text not null default 'Nuevo reporte {{folio}} · {{titulo}}',
  cuerpo_nuevo text not null default 'Nuevo reporte de {{solicitante}}.

Folio: {{folio}}
Asunto: {{titulo}}
Categoría: {{categoria}}

{{descripcion}}',
  asunto_respuesta text not null default 'Respuesta a tu reporte {{folio}}',
  cuerpo_respuesta text not null default 'Hola {{nombre}},

El equipo de TI respondió a tu reporte {{folio}} · {{titulo}}:

{{mensaje}}',
  asunto_estado text not null default 'Tu reporte {{folio}} ahora está: {{estado}}',
  cuerpo_estado text not null default 'Hola {{nombre}},

El estado de tu reporte {{folio}} · {{titulo}} cambió a: {{estado}}.',
  -- Defaults for the employee email signature (editable from the panel).
  firma_web text,
  firma_direccion text,
  firma_eslogan text,
  updated_at timestamptz not null default now()
);
insert into config_correo (id) values (1) on conflict (id) do nothing;
alter table config_correo enable row level security;
drop policy if exists "config_correo_autenticados" on config_correo;
create policy "config_correo_autenticados" on config_correo
  for all to authenticated using (true) with check (true);

-- ---------- CUSTODY LETTERS (responsivas) ----------
-- The custody document created when a device is assigned to an employee.
-- It is a legal document: it stores a FROZEN SNAPSHOT of the employee and device data
-- as of the moment it was generated (so it does not break if either later changes).
-- `plantilla` picks the format (see lib/domain/custody.ts and plantillas_responsiva);
-- `num` (a global serial) plus the template prefix form the folio (RES-LAP-0001).
-- Lifecycle: borrador -> pendiente_firma -> firmada -> devuelta (or cancelada).
create table if not exists responsivas (
  id uuid primary key default gen_random_uuid(),
  num serial,
  equipo_id uuid references equipos(id) on delete set null,
  plantilla text not null default 'laptop',
  -- employee snapshot (the primary custodian)
  empleado_correo text,
  empleado_nombre text,
  empleado_puesto text,
  empleado_departamento text,
  -- additional people on the document (co-custodians, witnesses, etc.), frozen.
  -- shape: [{ nombre, rol, puesto, departamento, correo, fuente:'empleado'|'manual' }]
  personas jsonb not null default '[]'::jsonb,
  -- device snapshot plus the editable document fields
  equipo_nombre text,
  datos jsonb not null default '{}'::jsonb, -- { equipo:{...}, accesorios:[], seguridad:[], observaciones, estado_fisico }
  estado text not null default 'borrador'
    check (estado in ('borrador','pendiente_firma','firmada','devuelta','cancelada')),
  archivo_url text,   -- path of the signed scan in the 'responsivas' Storage bucket
  archivo_nombre text,
  fecha_generada date not null default current_date,
  fecha_entrega date,  -- actual handover/return date (editable); falls back to fecha_generada when null
  fecha_firmada date,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- CUSTODY LETTER TEMPLATES ----------
-- Formats editable from the panel (clauses, accessories, security, signatures).
-- Starts EMPTY: the base content of the 8 templates lives in code
-- (DEFAULT_TEMPLATES, lib/domain/custody.ts). Editing a template in the panel
-- upserts a row here; reads merge this override over the default.
create table if not exists plantillas_responsiva (
  clave text primary key,            -- laptop|pc|movil|monitor|impresora|servidor|software|devolucion
  nombre text not null,              -- "Laptop / Portátil"
  codigo text not null,              -- "TI-RES-01"
  titulo text not null,              -- document subtitle
  prefijo_folio text not null,       -- "LAP"
  clausulas jsonb not null default '[]'::jsonb,  -- [{ titulo, texto }]
  accesorios jsonb not null default '[]'::jsonb, -- ["Cargador", ...]
  seguridad jsonb not null default '[]'::jsonb,  -- ["Cifrado de disco", ...]
  firmas jsonb not null default '[]'::jsonb,     -- [{ nombre, rol }]
  aviso text,                        -- text of the notice box
  iso text,                          -- footer listing the ISO controls
  campos_equipo jsonb,               -- ["marca","modelo",...]; null = show all
  version text not null default '1.0',
  updated_at timestamptz not null default now()
);

-- ---------- VENDORS ----------
-- Recurring department services (internet, licences, telephony).
-- `proximo_pago` anchors the calendar: lib/domain/invoices.ts projects future due
-- dates forward from it according to `periodicidad` (no rows are materialised).
-- When a payment is recorded from the panel, the action creates the matching
-- invoice and advances `proximo_pago` to the next period.
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  servicio text,                 -- what they supply: "Internet dedicado", "Microsoft 365"
  contacto text,
  telefono text,
  correo text,
  costo numeric(12,2),           -- cost per period; null = variable
  moneda text not null default 'MXN' check (moneda in ('MXN','USD')),
  periodicidad text not null default 'mensual'
    check (periodicidad in ('mensual','bimestral','trimestral','semestral','anual','unico')),
  proximo_pago date,             -- next due date; null = not on a schedule
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- INVOICES ----------
-- Department invoices and payments (managed from /ti/facturas).
-- `vencida` is NOT stored: it is derived in the UI (pendiente + fecha_vencimiento < today),
-- so no background process has to move statuses. PDF/XML attachments live in the
-- 'facturas' bucket: [{path,nombre,tipo}]. Internal folio = 'FAC-' + num
-- (lib/utils/format.ts).
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  num serial,
  proveedor_id uuid references proveedores(id) on delete set null,
  concepto text not null,
  folio_proveedor text,          -- the folio/series printed on the vendor invoice
  uuid_cfdi text,                -- CFDI tax folio (optional)
  monto numeric(12,2) not null default 0,
  moneda text not null default 'MXN' check (moneda in ('MXN','USD')),
  fecha_emision date,
  fecha_vencimiento date not null,
  fecha_pago date,               -- stamped when marked as paid
  metodo_pago text,              -- transfer, card, direct debit…
  estado text not null default 'pendiente'
    check (estado in ('pendiente','pagada','cancelada')),
  adjuntos jsonb not null default '[]'::jsonb,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- PETTY CASH ----------
-- The department imprest fund (managed from /ti/caja). The fund limit lives in
-- config_correo.caja_limite (the single configuration row).
-- A simple ledger: purchases drain the fund and reimbursements refill it;
-- balance = limit - purchases + reimbursements (lib/domain/pettyCash.ts). This is not
-- a tax record (that lives in SAP): internal control only.
create table if not exists caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('compra','reembolso')),
  fecha date not null,
  concepto text not null,
  monto numeric(12,2) not null check (monto > 0),
  comprador text,                -- who made the purchase (free text)
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- SERVICES (systems status) ----------
-- Catalogue of the services the company uses daily (internet, Microsoft 365, SAP,
-- internal network…). Their status is NOT stored: it is derived from the open incidents
-- (lib/domain/services.ts), the same way `vencida` works for invoices. `visible_portal`
-- controls whether outages of the service are announced in the employee portal.
create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  categoria text not null default 'plataforma'
    check (categoria in ('conectividad','plataforma','infraestructura','otro')),
  proveedor text,                -- who supplies it: Telmex, Microsoft, SAP…
  criticidad text not null default 'normal'
    check (criticidad in ('critica','alta','normal')),
  visible_portal boolean not null default true,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Initial catalogue (idempotent: `nombre` is unique and conflicts are ignored).
insert into servicios (nombre, categoria, proveedor, criticidad, orden) values
  ('Internet',       'conectividad',    null,        'critica', 1),
  ('Microsoft 365',  'plataforma',      'Microsoft', 'critica', 2),
  ('SAP',            'plataforma',      'SAP',       'critica', 3),
  ('Red interna',    'conectividad',    null,        'alta',    4),
  ('Telefonía',      'conectividad',    null,        'normal',  5),
  ('Impresión',      'infraestructura', null,        'normal',  6)
on conflict (nombre) do nothing;

-- ---------- INCIDENTS ----------
-- A record of outages, faults and maintenance per service. Folio INC-#### from `num`
-- (lib/utils/format.ts). Cycle: activo -> vigilando -> resuelto (resolving stamps `fin`;
-- duration is fin − inicio). An unresolved incident keeps the service marked as
-- "affected" both on the board and in the portal notice.
create table if not exists incidentes (
  id uuid primary key default gen_random_uuid(),
  num serial,
  servicio_id uuid not null references servicios(id) on delete cascade,
  titulo text not null,
  descripcion text,
  tipo text not null default 'caida'
    check (tipo in ('caida','degradado','mantenimiento')),
  estado text not null default 'activo'
    check (estado in ('activo','vigilando','resuelto')),
  inicio timestamptz not null default now(),
  fin timestamptz,               -- stamped on resolution
  resolucion text,               -- closing note: what was done
  created_at timestamptz not null default now()
);

-- ---------- PROJECTS AND TASKS ----------
-- The IT team work agenda (/ti/tareas). A project groups tasks; a task with no project
-- lives in the "inbox". Done = `completada_at` is stamped (a derived status, with no
-- extra boolean column).
create table if not exists proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  estado text not null default 'activo'
    check (estado in ('activo','pausado','completado','archivado')),
  fecha_objetivo date,
  created_at timestamptz not null default now()
);

create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  notas text,
  proyecto_id uuid references proyectos(id) on delete set null, -- null = inbox
  prioridad text not null default 'normal'
    check (prioridad in ('alta','normal')),
  fecha_limite date,
  completada_at timestamptz,     -- null = still pending
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_estado on tickets(estado);
create index if not exists idx_tickets_asignado_email on tickets(asignado_email);
create index if not exists idx_ticket_eventos_ticket on ticket_eventos(ticket_id, created_at);
create index if not exists idx_mantenimientos_fecha on mantenimientos(fecha_programada);
create index if not exists idx_tickets_solicitante_email on tickets(solicitante_email);
create index if not exists idx_equipos_asignado_email on equipos(asignado_email);
create index if not exists idx_equipos_categoria on equipos(categoria);
create index if not exists idx_tickets_equipo on tickets(equipo_id);
create index if not exists idx_mantenimientos_equipo on mantenimientos(equipo_id);
create index if not exists idx_responsivas_equipo on responsivas(equipo_id);
create index if not exists idx_responsivas_estado on responsivas(estado);
create index if not exists idx_facturas_estado on facturas(estado);
create index if not exists idx_facturas_vencimiento on facturas(fecha_vencimiento);
create index if not exists idx_facturas_proveedor on facturas(proveedor_id);
create index if not exists idx_proveedores_activo on proveedores(activo);
create index if not exists idx_caja_movimientos_fecha on caja_movimientos(fecha);
create index if not exists idx_incidentes_servicio on incidentes(servicio_id);
create index if not exists idx_incidentes_estado on incidentes(estado);
create index if not exists idx_tareas_proyecto on tareas(proyecto_id);
create index if not exists idx_tareas_completada on tareas(completada_at);

-- ---------- MIGRATION (for databases created earlier) ----------
-- `create table if not exists` does not add columns to existing tables; these lines do.
alter table equipos add column if not exists asignado_email text;
alter table tickets add column if not exists solicitante_email text;
alter table tickets add column if not exists equipo_id uuid references equipos(id) on delete set null;
alter table equipos add column if not exists categoria text not null default 'computo'
  check (categoria in ('computo','celular','linea','software'));
alter table equipos add column if not exists telefono text;
alter table equipos add column if not exists accesos jsonb not null default '{}'::jsonb;
alter table equipos add column if not exists extras jsonb not null default '{}'::jsonb;
alter table plantillas_responsiva add column if not exists campos_equipo jsonb;
alter table responsivas add column if not exists fecha_entrega date;
alter table responsivas add column if not exists personas jsonb not null default '[]'::jsonb;
alter table equipos drop constraint if exists equipos_tipo_check;
alter table equipos add constraint equipos_tipo_check
  check (tipo in ('laptop','desktop','monitor','impresora','red','servidor','perifericos','otro',
                  'celular','tablet','linea','software'));
-- Tickets: service times, assigned technician and the widened status set.
alter table tickets add column if not exists asignado_email text;
alter table tickets add column if not exists primera_respuesta_at timestamptz;
alter table tickets add column if not exists resuelto_at timestamptz;
alter table tickets add column if not exists adjuntos jsonb not null default '[]'::jsonb;
alter table tickets drop constraint if exists tickets_estado_check;
alter table tickets add constraint tickets_estado_check
  check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto','archivado'));
-- Activity log: the `respuesta` (IT -> requester) and `mensaje_cliente` (requester -> IT)
-- types, both visible in the portal thread.
alter table ticket_eventos drop constraint if exists ticket_eventos_tipo_check;
alter table ticket_eventos add constraint ticket_eventos_tipo_check
  check (tipo in ('comentario','estado','asignacion','sistema','respuesta','mensaje_cliente'));
-- One-off migration: every already resolved/closed ticket moves to archivado (leaving the
-- active board). Stamps resuelto_at where it was missing so the resolution metric survives.
update tickets set resuelto_at = coalesce(resuelto_at, updated_at, created_at)
  where estado in ('resuelto','cerrado') and resuelto_at is null;
update tickets set estado = 'archivado'
  where estado in ('resuelto','cerrado');
-- Email: the OAuth2 methods (Microsoft Graph app-only and interactive login).
alter table config_correo add column if not exists metodo text not null default 'smtp_basico';
alter table config_correo drop constraint if exists config_correo_metodo_check;
alter table config_correo add constraint config_correo_metodo_check
  check (metodo in ('smtp_basico','graph_app','oauth_interactivo'));
alter table config_correo add column if not exists azure_tenant_id text;
alter table config_correo add column if not exists azure_client_id text;
alter table config_correo add column if not exists azure_client_secret text;
alter table config_correo add column if not exists oauth_refresh_token text;
alter table config_correo add column if not exists oauth_cuenta text;
-- Defaults for the employee email signature.
alter table config_correo add column if not exists firma_web text;
alter table config_correo add column if not exists firma_direccion text;
alter table config_correo add column if not exists firma_eslogan text;
-- Internal notice to IT when a new ticket arrives from the portal (recipients configurable).
alter table config_correo add column if not exists notif_nuevo boolean not null default true;
alter table config_correo add column if not exists notif_nuevo_destinos text;
alter table config_correo add column if not exists asunto_nuevo text not null default 'Nuevo reporte {{folio}} · {{titulo}}';
alter table config_correo add column if not exists cuerpo_nuevo text not null default 'Nuevo reporte de {{solicitante}}.

Folio: {{folio}}
Asunto: {{titulo}}
Categoría: {{categoria}}

{{descripcion}}';
update config_correo set notif_nuevo_destinos = 'sistemas@plasticospimsa.com'
  where notif_nuevo_destinos is null;
-- Configurable SLA per priority (clock hours). NULL = fall back to the code default.
-- Managed from /ti/correo (the "Tiempos de respuesta" section). ITIL 4 values for a
-- manufacturer running continuous shifts: critical 1h/4h, high 4h/24h, medium 8h/48h,
-- low 24h/96h.
alter table config_correo add column if not exists sla_critica_respuesta  int;
alter table config_correo add column if not exists sla_critica_resolucion int;
alter table config_correo add column if not exists sla_alta_respuesta     int;
alter table config_correo add column if not exists sla_alta_resolucion    int;
alter table config_correo add column if not exists sla_media_respuesta    int;
alter table config_correo add column if not exists sla_media_resolucion   int;
alter table config_correo add column if not exists sla_baja_respuesta     int;
alter table config_correo add column if not exists sla_baja_resolucion    int;
alter table config_correo add column if not exists sla_por_vencer_pct int not null default 80;
-- Petty cash limit (the imprest fund). NULL = not configured; captured at /ti/caja.
alter table config_correo add column if not exists caja_limite numeric(12,2);

-- ---------- SECURITY (RLS) ----------
-- Only authenticated users (Supabase Auth) can read and write.
-- The anon key without a session has NO access to any table.
-- Users are created by hand at: Supabase -> Authentication -> Users -> Add user.
-- The employee portal (app/(portal)) does NOT use Supabase Auth: the server reads with
-- the service role key (SUPABASE_SERVICE_ROLE_KEY, server-only) and filters by the
-- employee email. That is why no `to anon` policies are added.
alter table equipos enable row level security;
alter table mantenimientos enable row level security;
alter table tickets enable row level security;
alter table empleados enable row level security;
alter table ticket_eventos enable row level security;
alter table responsivas enable row level security;
alter table plantillas_responsiva enable row level security;
alter table campos_inventario enable row level security;
alter table proveedores enable row level security;
alter table facturas enable row level security;
alter table caja_movimientos enable row level security;
alter table servicios enable row level security;
alter table incidentes enable row level security;
alter table proyectos enable row level security;
alter table tareas enable row level security;

-- Coming from the previous schema (open access)? These lines drop those policies.
drop policy if exists "acceso_total_equipos" on equipos;
drop policy if exists "acceso_total_mantenimientos" on mantenimientos;
drop policy if exists "acceso_total_tickets" on tickets;

create policy "equipos_autenticados" on equipos
  for all to authenticated using (true) with check (true);
create policy "mantenimientos_autenticados" on mantenimientos
  for all to authenticated using (true) with check (true);
create policy "tickets_autenticados" on tickets
  for all to authenticated using (true) with check (true);
drop policy if exists "empleados_autenticados" on empleados;
create policy "empleados_autenticados" on empleados
  for all to authenticated using (true) with check (true);
drop policy if exists "ticket_eventos_autenticados" on ticket_eventos;
create policy "ticket_eventos_autenticados" on ticket_eventos
  for all to authenticated using (true) with check (true);
drop policy if exists "responsivas_autenticados" on responsivas;
create policy "responsivas_autenticados" on responsivas
  for all to authenticated using (true) with check (true);
drop policy if exists "plantillas_autenticados" on plantillas_responsiva;
create policy "plantillas_autenticados" on plantillas_responsiva
  for all to authenticated using (true) with check (true);
drop policy if exists "campos_inventario_autenticados" on campos_inventario;
create policy "campos_inventario_autenticados" on campos_inventario
  for all to authenticated using (true) with check (true);
drop policy if exists "proveedores_autenticados" on proveedores;
create policy "proveedores_autenticados" on proveedores
  for all to authenticated using (true) with check (true);
drop policy if exists "facturas_autenticados" on facturas;
create policy "facturas_autenticados" on facturas
  for all to authenticated using (true) with check (true);
drop policy if exists "caja_movimientos_autenticados" on caja_movimientos;
create policy "caja_movimientos_autenticados" on caja_movimientos
  for all to authenticated using (true) with check (true);
-- Systems status: services and incidents are global; only the panel (authenticated users)
-- manages them. The portal reads them with the service role (bypassing RLS), no anon
-- policies.
drop policy if exists "servicios_autenticados" on servicios;
create policy "servicios_autenticados" on servicios
  for all to authenticated using (true) with check (true);
drop policy if exists "incidentes_autenticados" on incidentes;
create policy "incidentes_autenticados" on incidentes
  for all to authenticated using (true) with check (true);
-- Tasks and projects: internal IT use, authenticated only.
drop policy if exists "proyectos_autenticados" on proyectos;
create policy "proyectos_autenticados" on proyectos
  for all to authenticated using (true) with check (true);
drop policy if exists "tareas_autenticados" on tareas;
create policy "tareas_autenticados" on tareas
  for all to authenticated using (true) with check (true);

-- ---------- STORAGE: signed custody letters bucket ----------
-- Holds the signed scan/PDF of each custody letter. Private: only the panel
-- (authenticated users) uploads and downloads; the employee portal never touches it.
insert into storage.buckets (id, name, public)
  values ('responsivas', 'responsivas', false)
  on conflict (id) do nothing;

drop policy if exists "responsivas_storage_rw" on storage.objects;
create policy "responsivas_storage_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'responsivas')
  with check (bucket_id = 'responsivas');

-- ---------- STORAGE: report photos bucket ----------
-- Images the employee attaches when filing a report from the portal.
-- Private: the portal UPLOADS with the service role (bypassing RLS) and the IT panel
-- (authenticated users) READS them to show in the ticket detail.
insert into storage.buckets (id, name, public)
  values ('tickets', 'tickets', false)
  on conflict (id) do nothing;

drop policy if exists "tickets_storage_rw" on storage.objects;
create policy "tickets_storage_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'tickets')
  with check (bucket_id = 'tickets');

-- ---------- STORAGE: invoices bucket (PDF/XML) ----------
-- The files for each invoice (the CFDI PDF and XML). Private: only the IT panel
-- (authenticated users) uploads and downloads; the employee portal never touches it.
insert into storage.buckets (id, name, public)
  values ('facturas', 'facturas', false)
  on conflict (id) do nothing;

drop policy if exists "facturas_storage_rw" on storage.objects;
create policy "facturas_storage_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'facturas')
  with check (bucket_id = 'facturas');

-- ---------- DATOS DE EJEMPLO ----------
-- Fresh installs only: do NOT re-run this section against a database that already has
-- data (the inserts would be duplicated).
insert into empleados (nombre, correo, departamento, puesto, extension) values
  ('María López', 'maria.lopez@plasticospimsa.com', 'Edición', 'Editora', '102'),
  ('Carlos Ruiz', 'carlos.ruiz@plasticospimsa.com', 'Administración', 'Contador', '110');

insert into equipos (nombre, categoria, tipo, marca, modelo, num_serie, telefono, asignado_a, asignado_email, ubicacion, estado, fecha_compra, garantia_hasta) values
  ('LAP-EDICION-01', 'computo', 'laptop', 'Dell', 'Precision 5680', 'DLP5680-8842', null, 'María López', 'maria.lopez@plasticospimsa.com', 'Oficina · Piso 2', 'activo', '2024-03-15', '2027-03-15'),
  ('PC-RENDER-01', 'computo', 'desktop', 'HP', 'Z4 G5', 'HPZ4-22091', null, 'Sala de render', null, 'Oficina · Piso 1', 'activo', '2023-08-01', '2026-08-01'),
  ('IMP-PISO2', 'computo', 'impresora', 'Brother', 'HL-L6400DW', 'BRO-77120', null, null, null, 'Oficina · Piso 2', 'en_reparacion', '2022-01-20', '2024-01-20'),
  ('SW-CORE-01', 'computo', 'red', 'Ubiquiti', 'USW-Pro-24', 'UBQ-PRO24-031', null, null, null, 'Site · Rack principal', 'activo', '2023-11-10', '2025-11-10'),
  ('CEL-ADMON-01', 'celular', 'celular', 'Samsung', 'Galaxy A54', 'IMEI-358200001', '81-1234-5678', 'Carlos Ruiz', 'carlos.ruiz@plasticospimsa.com', null, 'activo', '2024-06-10', '2025-06-10'),
  ('Línea 81-9876-5432', 'linea', 'linea', 'Telcel', 'Plan 5 GB', null, '81-9876-5432', null, null, null, 'activo', null, null),
  ('Microsoft 365 Business', 'software', 'software', 'Microsoft', 'Business Standard', null, null, 'María López', 'maria.lopez@plasticospimsa.com', null, 'activo', '2024-01-01', '2026-01-01');

insert into mantenimientos (titulo, tipo, fecha_programada, responsable, estado, notas) values
  ('Limpieza física y pasta térmica PC-RENDER-01', 'preventivo', current_date + 7, 'Lalo', 'programado', 'Incluye revisión de ventiladores'),
  ('Cambio de tóner y rodillo IMP-PISO2', 'correctivo', current_date + 2, 'Lalo', 'en_proceso', null),
  ('Respaldo y verificación de NAS', 'preventivo', current_date + 14, 'TI', 'programado', 'Verificar integridad de respaldos de obras');

insert into tickets (titulo, descripcion, solicitante, categoria, prioridad, estado, asignado_a) values
  ('Premiere se cierra al exportar', 'Al exportar H.264 en 4K el programa se cierra sin error.', 'María (Edición)', 'software', 'alta', 'abierto', 'Lalo'),
  ('No imprime desde piso 2', 'La impresora marca atasco pero no hay papel atorado.', 'Carlos (Admon)', 'hardware', 'media', 'en_proceso', 'Lalo'),
  ('Acceso a carpeta de obras finalizadas', 'Necesito permiso de lectura en Finalizadas/2025.', 'Ana (Proyectos)', 'accesos', 'baja', 'resuelto', 'TI');

-- Sample service times so the board shows SLA metrics from the start. Idempotent (it
-- only fills null values): re-running does not duplicate anything.
update tickets set primera_respuesta_at = created_at + interval '35 minutes'
  where estado in ('en_proceso','en_espera','resuelto','cerrado','reabierto') and primera_respuesta_at is null;
update tickets set resuelto_at = created_at + interval '3 hours'
  where estado in ('resuelto','cerrado') and resuelto_at is null;
