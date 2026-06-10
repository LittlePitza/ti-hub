-- ============================================================
-- TI Hub · Esquema de base de datos
-- Pegar completo en: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- INVENTARIO ----------
create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'laptop'
    check (tipo in ('laptop','desktop','monitor','impresora','red','servidor','perifericos','otro')),
  marca text,
  modelo text,
  num_serie text,
  asignado_a text,
  asignado_email text, -- correo del empleado; vincula sus equipos en el portal
  ubicacion text,
  estado text not null default 'activo'
    check (estado in ('activo','en_reparacion','almacen','baja')),
  fecha_compra date,
  garantia_hasta date,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- MANTENIMIENTOS ----------
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
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  num serial,
  titulo text not null,
  descripcion text,
  solicitante text not null,
  solicitante_email text,                                    -- correo del empleado (portal)
  equipo_id uuid references equipos(id) on delete set null,  -- equipo relacionado (portal)
  categoria text not null default 'hardware'
    check (categoria in ('hardware','software','red','accesos','correo','otro')),
  prioridad text not null default 'media'
    check (prioridad in ('baja','media','alta','critica')),
  estado text not null default 'abierto'
    check (estado in ('abierto','en_proceso','resuelto','cerrado')),
  asignado_a text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_estado on tickets(estado);
create index if not exists idx_mantenimientos_fecha on mantenimientos(fecha_programada);
create index if not exists idx_tickets_solicitante_email on tickets(solicitante_email);
create index if not exists idx_equipos_asignado_email on equipos(asignado_email);

-- ---------- MIGRACIÓN (bases creadas antes del portal del empleado) ----------
-- `create table if not exists` no agrega columnas a tablas existentes; estas líneas sí.
alter table equipos add column if not exists asignado_email text;
alter table tickets add column if not exists solicitante_email text;
alter table tickets add column if not exists equipo_id uuid references equipos(id) on delete set null;

-- ---------- SEGURIDAD (RLS) ----------
-- Solo usuarios autenticados (Supabase Auth) pueden leer y escribir.
-- La anon key sin sesión NO tiene acceso a ninguna tabla.
-- Los usuarios se crean a mano en: Supabase -> Authentication -> Users -> Add user.
-- El portal del empleado (app/portal) NO usa Supabase Auth: el servidor accede con la
-- service role key (SUPABASE_SERVICE_ROLE_KEY, solo en el servidor) y filtra por el
-- correo del empleado; por eso no se agregan políticas `to anon`.
alter table equipos enable row level security;
alter table mantenimientos enable row level security;
alter table tickets enable row level security;

-- Si vienes del esquema anterior (acceso abierto), estas líneas retiran esas políticas.
drop policy if exists "acceso_total_equipos" on equipos;
drop policy if exists "acceso_total_mantenimientos" on mantenimientos;
drop policy if exists "acceso_total_tickets" on tickets;

create policy "equipos_autenticados" on equipos
  for all to authenticated using (true) with check (true);
create policy "mantenimientos_autenticados" on mantenimientos
  for all to authenticated using (true) with check (true);
create policy "tickets_autenticados" on tickets
  for all to authenticated using (true) with check (true);

-- ---------- DATOS DE EJEMPLO ----------
insert into equipos (nombre, tipo, marca, modelo, num_serie, asignado_a, ubicacion, estado, fecha_compra, garantia_hasta) values
  ('LAP-EDICION-01', 'laptop', 'Dell', 'Precision 5680', 'DLP5680-8842', 'Edición / Video', 'Oficina QRO · Piso 2', 'activo', '2024-03-15', '2027-03-15'),
  ('PC-RENDER-01', 'desktop', 'HP', 'Z4 G5', 'HPZ4-22091', 'Sala de render', 'Oficina QRO · Piso 1', 'activo', '2023-08-01', '2026-08-01'),
  ('IMP-PISO2', 'impresora', 'Brother', 'HL-L6400DW', 'BRO-77120', null, 'Oficina QRO · Piso 2', 'en_reparacion', '2022-01-20', '2024-01-20'),
  ('SW-CORE-01', 'red', 'Ubiquiti', 'USW-Pro-24', 'UBQ-PRO24-031', null, 'Site · Rack principal', 'activo', '2023-11-10', '2025-11-10');

insert into mantenimientos (titulo, tipo, fecha_programada, responsable, estado, notas) values
  ('Limpieza física y pasta térmica PC-RENDER-01', 'preventivo', current_date + 7, 'Lalo', 'programado', 'Incluye revisión de ventiladores'),
  ('Cambio de tóner y rodillo IMP-PISO2', 'correctivo', current_date + 2, 'Lalo', 'en_proceso', null),
  ('Respaldo y verificación de NAS', 'preventivo', current_date + 14, 'TI', 'programado', 'Verificar integridad de respaldos de obras');

insert into tickets (titulo, descripcion, solicitante, categoria, prioridad, estado, asignado_a) values
  ('Premiere se cierra al exportar', 'Al exportar H.264 en 4K el programa se cierra sin error.', 'María (Edición)', 'software', 'alta', 'abierto', 'Lalo'),
  ('No imprime desde piso 2', 'La impresora marca atasco pero no hay papel atorado.', 'Carlos (Admon)', 'hardware', 'media', 'en_proceso', 'Lalo'),
  ('Acceso a carpeta de obras finalizadas', 'Necesito permiso de lectura en Finalizadas/2025.', 'Ana (Proyectos)', 'accesos', 'baja', 'resuelto', 'TI');
