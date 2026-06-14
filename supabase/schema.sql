-- ============================================================
-- TI Hub · Esquema de base de datos
-- Pegar completo en: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- EMPLEADOS ----------
-- Fuente de asignación: cada empleado se identifica por su correo (único);
-- el inventario y el portal ligan equipos y tickets a ese correo.
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

-- ---------- INVENTARIO ----------
-- Una sola tabla para todo el inventario, dividida por `categoria`:
--   computo  -> laptops, desktops, monitores, impresoras, red, servidores, periféricos
--   celular  -> smartphones y tablets (num_serie = IMEI, telefono = línea que trae)
--   linea    -> líneas telefónicas (telefono = número, marca = compañía, modelo = plan);
--               una línea sin asignado_email está "libre"
--   software -> licencias (marca = proveedor, modelo = versión/plan, num_serie = clave,
--               garantia_hasta = renovación)
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
  telefono text, -- número de la línea (categorías celular y linea)
  asignado_a text,
  asignado_email text, -- correo del empleado (empleados.correo); vincula sus equipos en el portal
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
-- Ciclo de vida tipo mesa de ayuda (Jira-like):
--   abierto -> en_proceso <-> en_espera -> resuelto -> cerrado ; reabierto regresa al flujo.
-- Tiempos de atención: `primera_respuesta_at` (primer contacto de TI) y `resuelto_at`
--   (paso a resuelto/cerrado) permiten medir respuesta y resolución contra el SLA por
--   prioridad definido en `lib/tickets.ts`.
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
    check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto')),
  asignado_a text,
  asignado_email text,                -- correo del técnico de TI responsable (opcional)
  primera_respuesta_at timestamptz,   -- primer contacto de TI; base del tiempo de respuesta
  resuelto_at timestamptz,            -- paso a resuelto/cerrado; base del tiempo de resolución
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- BITÁCORA DE TICKETS ----------
-- Historial por ticket: comentarios de TI, cambios de estado, reasignaciones y eventos
-- del sistema (creación, edición). Solo lo ve el panel de TI (RLS `to authenticated`);
-- el portal del empleado no lee esta tabla, por eso sirve para notas internas.
create table if not exists ticket_eventos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tipo text not null default 'comentario'
    check (tipo in ('comentario','estado','asignacion','sistema')),
  autor text,                -- correo o nombre de quien generó el evento
  cuerpo text,               -- texto del comentario o detalle del cambio
  estado_anterior text,
  estado_nuevo text,
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

-- ---------- MIGRACIÓN (bases creadas antes) ----------
-- `create table if not exists` no agrega columnas a tablas existentes; estas líneas sí.
alter table equipos add column if not exists asignado_email text;
alter table tickets add column if not exists solicitante_email text;
alter table tickets add column if not exists equipo_id uuid references equipos(id) on delete set null;
alter table equipos add column if not exists categoria text not null default 'computo'
  check (categoria in ('computo','celular','linea','software'));
alter table equipos add column if not exists telefono text;
alter table equipos drop constraint if exists equipos_tipo_check;
alter table equipos add constraint equipos_tipo_check
  check (tipo in ('laptop','desktop','monitor','impresora','red','servidor','perifericos','otro',
                  'celular','tablet','linea','software'));
-- Tickets: tiempos de atención, técnico asignado y estados ampliados.
alter table tickets add column if not exists asignado_email text;
alter table tickets add column if not exists primera_respuesta_at timestamptz;
alter table tickets add column if not exists resuelto_at timestamptz;
alter table tickets drop constraint if exists tickets_estado_check;
alter table tickets add constraint tickets_estado_check
  check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto'));

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
alter table empleados enable row level security;
alter table ticket_eventos enable row level security;

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
drop policy if exists "empleados_autenticados" on empleados;
create policy "empleados_autenticados" on empleados
  for all to authenticated using (true) with check (true);
drop policy if exists "ticket_eventos_autenticados" on ticket_eventos;
create policy "ticket_eventos_autenticados" on ticket_eventos
  for all to authenticated using (true) with check (true);

-- ---------- DATOS DE EJEMPLO ----------
-- Solo para instalaciones nuevas: NO re-ejecutar esta sección sobre una base con datos
-- (los inserts se duplicarían).
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

-- Tiempos de atención de ejemplo para que el tablero muestre métricas de SLA desde el
-- inicio. Idempotente (solo rellena valores nulos): no duplica al re-ejecutarse.
update tickets set primera_respuesta_at = created_at + interval '35 minutes'
  where estado in ('en_proceso','en_espera','resuelto','cerrado','reabierto') and primera_respuesta_at is null;
update tickets set resuelto_at = created_at + interval '3 hours'
  where estado in ('resuelto','cerrado') and resuelto_at is null;
