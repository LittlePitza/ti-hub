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
  -- credenciales y accesos del equipo (RustDesk, admin local y otros).
  -- forma: { rustdesk:{id,pass}, admin:{usuario,pass}, extra:[{etiqueta,usuario,secreto}] }
  -- SOLO panel de TI: nunca seleccionar esta columna desde el portal del empleado.
  accesos jsonb not null default '{}'::jsonb,
  -- valores de los campos personalizados por categoría (ver tabla campos_inventario).
  -- forma: { [clave]: valor }. SOLO panel de TI: no seleccionar desde el portal.
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- CAMPOS PERSONALIZADOS DEL INVENTARIO ----------
-- Definiciones editables desde /ti/inventario/configuracion: TI agrega campos
-- nuevos por categoría sin tocar código. Los valores capturados viven en
-- equipos.extras ({ [clave]: valor }); aquí solo está el catálogo de campos.
create table if not exists campos_inventario (
  id uuid primary key default gen_random_uuid(),
  categoria text not null
    check (categoria in ('computo','celular','linea','software')),
  clave text not null,                 -- slug estable; key dentro de equipos.extras
  etiqueta text not null,              -- lo que ve TI ("N° de serie")
  tipo text not null default 'texto'
    check (tipo in ('texto','numero','fecha','opciones','booleano')),
  opciones jsonb not null default '[]'::jsonb,  -- para tipo 'opciones': ["A","B"]
  placeholder text,
  requerido boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (categoria, clave)
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
--   abierto -> en_proceso <-> en_espera -> archivado ; reabierto regresa al flujo.
--   `archivado` es el estado terminal: al resolver, el ticket se archiva y sale del
--   tablero activo. (resuelto/cerrado quedan permitidos por compatibilidad con datos
--   antiguos y la bitácora, pero el flujo nuevo archiva directamente.)
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
    check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto','archivado')),
  asignado_a text,
  asignado_email text,                -- correo del técnico de TI responsable (opcional)
  primera_respuesta_at timestamptz,   -- primer contacto de TI; base del tiempo de respuesta
  resuelto_at timestamptz,            -- paso a resuelto/cerrado; base del tiempo de resolución
  adjuntos jsonb not null default '[]'::jsonb, -- fotos del reporte (portal): [{path,nombre,tipo}] en bucket 'tickets'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- BITÁCORA DE TICKETS ----------
-- Historial por ticket: comentarios internos de TI, cambios de estado, reasignaciones,
-- eventos del sistema (creación, edición), `respuesta` (mensaje de TI al solicitante) y
-- `mensaje_cliente` (respuesta que el solicitante escribe desde el portal).
-- Casi todo es interno (RLS `to authenticated`); el portal del empleado lee/escribe solo
-- `respuesta` y `mensaje_cliente` (filtrados por su correo vía service role) para el hilo.
create table if not exists ticket_eventos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tipo text not null default 'comentario'
    check (tipo in ('comentario','estado','asignacion','sistema','respuesta','mensaje_cliente')),
  autor text,                -- correo o nombre de quien generó el evento
  cuerpo text,               -- texto del comentario o detalle del cambio
  estado_anterior text,
  estado_nuevo text,
  created_at timestamptz not null default now()
);

-- ---------- CONFIGURACIÓN DE CORREO ----------
-- Una sola fila (id = 1) con el SMTP y las plantillas de notificación al solicitante.
-- Se administra desde el panel (/ti/correo), no por variables de entorno. La envía
-- TI a voluntad (no automático). Solo la leen/escriben usuarios autenticados (RLS).
create table if not exists config_correo (
  id int primary key default 1 check (id = 1),
  activo boolean not null default false,
  -- Método de envío: SMTP básico (legado), app-only Graph o login interactivo OAuth.
  metodo text not null default 'smtp_basico'
    check (metodo in ('smtp_basico','graph_app','oauth_interactivo')),
  smtp_host text not null default 'smtp.office365.com',
  smtp_port int not null default 587,
  smtp_user text,
  smtp_pass text,
  -- Credenciales OAuth2 / Microsoft Entra ID (Azure) para graph_app y oauth_interactivo.
  azure_tenant_id text,
  azure_client_id text,
  azure_client_secret text,
  oauth_refresh_token text,            -- solo oauth_interactivo: token de actualización
  oauth_cuenta text,                   -- correo de la cuenta conectada (para mostrar)
  remitente text,
  remitente_nombre text not null default 'Soporte TI · Plásticos PIMSA',
  sitio_url text,
  notif_respuesta_def boolean not null default true,  -- casilla precargada al responder
  notif_estado_def boolean not null default false,    -- casilla precargada al cambiar estado
  -- Aviso interno a TI cuando entra un ticket nuevo desde el portal del empleado.
  notif_nuevo boolean not null default true,
  notif_nuevo_destinos text,                          -- correos destino (coma/salto de línea)
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
  -- Valores por defecto de la firma de correo de empleados (editables en el panel).
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

-- ---------- RESPONSIVAS (cartas de resguardo) ----------
-- Documento de custodia que nace al asignar un equipo a un empleado.
-- Es un documento legal: guarda un SNAPSHOT congelado de los datos del
-- empleado y del equipo al momento de generarse (no se rompe si luego cambian).
-- `plantilla` elige el formato (ver lib/responsivas.ts y plantillas_responsiva);
-- `num` (serial global) + prefijo de la plantilla forman el folio (RES-LAP-0001).
-- Ciclo de vida: borrador -> pendiente_firma -> firmada -> devuelta (o cancelada).
create table if not exists responsivas (
  id uuid primary key default gen_random_uuid(),
  num serial,
  equipo_id uuid references equipos(id) on delete set null,
  plantilla text not null default 'laptop',
  -- snapshot del empleado (resguardante principal)
  empleado_correo text,
  empleado_nombre text,
  empleado_puesto text,
  empleado_departamento text,
  -- personas adicionales del documento (co-resguardatarios, testigos, etc.), congeladas.
  -- forma: [{ nombre, rol, puesto, departamento, correo, fuente:'empleado'|'manual' }]
  personas jsonb not null default '[]'::jsonb,
  -- snapshot del equipo + datos editables del documento
  equipo_nombre text,
  datos jsonb not null default '{}'::jsonb, -- { equipo:{...}, accesorios:[], seguridad:[], observaciones, estado_fisico }
  estado text not null default 'borrador'
    check (estado in ('borrador','pendiente_firma','firmada','devuelta','cancelada')),
  archivo_url text,   -- ruta del escaneo firmado en el bucket 'responsivas' de Storage
  archivo_nombre text,
  fecha_generada date not null default current_date,
  fecha_entrega date,  -- fecha real de entrega/devolución (editable); si null, cae a fecha_generada
  fecha_firmada date,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- PLANTILLAS DE RESPONSIVA ----------
-- Formatos editables desde el panel (cláusulas, accesorios, seguridad, firmas).
-- Arranca VACÍA: el contenido base de las 8 plantillas vive en código
-- (PLANTILLAS_DEFAULT, lib/responsivas.ts). Editar una plantilla en el panel
-- hace upsert de la fila aquí; las lecturas mezclan este override sobre el default.
create table if not exists plantillas_responsiva (
  clave text primary key,            -- laptop|pc|movil|monitor|impresora|servidor|software|devolucion
  nombre text not null,              -- "Laptop / Portátil"
  codigo text not null,              -- "TI-RES-01"
  titulo text not null,              -- subtítulo del documento
  prefijo_folio text not null,       -- "LAP"
  clausulas jsonb not null default '[]'::jsonb,  -- [{ titulo, texto }]
  accesorios jsonb not null default '[]'::jsonb, -- ["Cargador", ...]
  seguridad jsonb not null default '[]'::jsonb,  -- ["Cifrado de disco", ...]
  firmas jsonb not null default '[]'::jsonb,     -- [{ nombre, rol }]
  aviso text,                        -- texto del recuadro de aviso
  iso text,                          -- pie con controles ISO
  campos_equipo jsonb,               -- ["marca","modelo",...]; null = mostrar todos
  version text not null default '1.0',
  updated_at timestamptz not null default now()
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

-- ---------- MIGRACIÓN (bases creadas antes) ----------
-- `create table if not exists` no agrega columnas a tablas existentes; estas líneas sí.
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
-- Tickets: tiempos de atención, técnico asignado y estados ampliados.
alter table tickets add column if not exists asignado_email text;
alter table tickets add column if not exists primera_respuesta_at timestamptz;
alter table tickets add column if not exists resuelto_at timestamptz;
alter table tickets add column if not exists adjuntos jsonb not null default '[]'::jsonb;
alter table tickets drop constraint if exists tickets_estado_check;
alter table tickets add constraint tickets_estado_check
  check (estado in ('abierto','en_proceso','en_espera','resuelto','cerrado','reabierto','archivado'));
-- Bitácora: tipos `respuesta` (TI -> solicitante) y `mensaje_cliente` (solicitante -> TI),
-- ambos visibles en el hilo del portal.
alter table ticket_eventos drop constraint if exists ticket_eventos_tipo_check;
alter table ticket_eventos add constraint ticket_eventos_tipo_check
  check (tipo in ('comentario','estado','asignacion','sistema','respuesta','mensaje_cliente'));
-- Migración única: todos los tickets ya resueltos/cerrados pasan a archivado (sale del
-- tablero activo). Sella resuelto_at si faltaba para conservar la métrica de resolución.
update tickets set resuelto_at = coalesce(resuelto_at, updated_at, created_at)
  where estado in ('resuelto','cerrado') and resuelto_at is null;
update tickets set estado = 'archivado'
  where estado in ('resuelto','cerrado');
-- Correo: métodos OAuth2 (Microsoft Graph app-only y login interactivo).
alter table config_correo add column if not exists metodo text not null default 'smtp_basico';
alter table config_correo drop constraint if exists config_correo_metodo_check;
alter table config_correo add constraint config_correo_metodo_check
  check (metodo in ('smtp_basico','graph_app','oauth_interactivo'));
alter table config_correo add column if not exists azure_tenant_id text;
alter table config_correo add column if not exists azure_client_id text;
alter table config_correo add column if not exists azure_client_secret text;
alter table config_correo add column if not exists oauth_refresh_token text;
alter table config_correo add column if not exists oauth_cuenta text;
-- Valores por defecto de la firma de correo de empleados.
alter table config_correo add column if not exists firma_web text;
alter table config_correo add column if not exists firma_direccion text;
alter table config_correo add column if not exists firma_eslogan text;
-- Aviso interno a TI al entrar un ticket nuevo desde el portal (destinatarios configurables).
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
-- SLA configurable por prioridad (horas de reloj). NULL = usar predeterminado del código.
-- Se administra desde /ti/correo (sección "Tiempos de respuesta"). Valores ITIL 4 para
-- empresa manufacturera (turnos continuos): crítica 1h/4h, alta 4h/24h, media 8h/48h, baja 24h/96h.
alter table config_correo add column if not exists sla_critica_respuesta  int;
alter table config_correo add column if not exists sla_critica_resolucion int;
alter table config_correo add column if not exists sla_alta_respuesta     int;
alter table config_correo add column if not exists sla_alta_resolucion    int;
alter table config_correo add column if not exists sla_media_respuesta    int;
alter table config_correo add column if not exists sla_media_resolucion   int;
alter table config_correo add column if not exists sla_baja_respuesta     int;
alter table config_correo add column if not exists sla_baja_resolucion    int;
alter table config_correo add column if not exists sla_por_vencer_pct int not null default 80;

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
alter table responsivas enable row level security;
alter table plantillas_responsiva enable row level security;
alter table campos_inventario enable row level security;

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
drop policy if exists "responsivas_autenticados" on responsivas;
create policy "responsivas_autenticados" on responsivas
  for all to authenticated using (true) with check (true);
drop policy if exists "plantillas_autenticados" on plantillas_responsiva;
create policy "plantillas_autenticados" on plantillas_responsiva
  for all to authenticated using (true) with check (true);
drop policy if exists "campos_inventario_autenticados" on campos_inventario;
create policy "campos_inventario_autenticados" on campos_inventario
  for all to authenticated using (true) with check (true);

-- ---------- STORAGE: bucket de responsivas firmadas ----------
-- Guarda el escaneo/PDF firmado de cada responsiva. Privado: solo el panel
-- (usuarios autenticados) sube y descarga; el portal del empleado no lo toca.
insert into storage.buckets (id, name, public)
  values ('responsivas', 'responsivas', false)
  on conflict (id) do nothing;

drop policy if exists "responsivas_storage_rw" on storage.objects;
create policy "responsivas_storage_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'responsivas')
  with check (bucket_id = 'responsivas');

-- ---------- STORAGE: bucket de fotos de reportes ----------
-- Imágenes que el empleado adjunta al levantar un reporte desde el portal.
-- Privado: el portal SUBE con la service role (salta RLS) y el panel de TI
-- (usuarios autenticados) las LEE para mostrarlas en el detalle del ticket.
insert into storage.buckets (id, name, public)
  values ('tickets', 'tickets', false)
  on conflict (id) do nothing;

drop policy if exists "tickets_storage_rw" on storage.objects;
create policy "tickets_storage_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'tickets')
  with check (bucket_id = 'tickets');

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
