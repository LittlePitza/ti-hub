# Planeación — TI Hub · PIMSA

> Hoja de ruta del sistema interno de TI. Integra todo lo definido con el encargado de TI
> (Luis Hernandez · sistemas@plasticospimsa.com). Empresa: Plásticos PIMSA, Santa Catarina, N.L.
>
> **Convención:** 🔴 crítico · 🟡 importante · 🟢 mejora. Marcar `[x]` al completar.
> El esquema de BD es la fuente de verdad: todo cambio va a `supabase/schema.sql`.

---

## Visión

El **TI Hub** es la herramienta operativa del área de TI de PIMSA. Tiene dos caras:

1. **Portal del empleado** (`app/(portal)/`, **página principal**: rutas `/` y `/nuevo`) — interfaz simple para que cualquier trabajador levante tickets sin fricción.
2. **Panel de TI** (`app/ti/`, ruta discreta `/ti` con login) — uso interno del equipo de sistemas: inventario por categorías, empleados, mantenimientos, tickets, proveedores.

Lo que NO vive en esta app (queda como documentación/administración en `PIMSA-Microsoft365/`): configuración de seguridad de M365 (MFA, roles), respaldos, red e infraestructura. La app es lo **operativo del día a día**.

---

## Estado actual (Fase 0 — ✅ hecho)

- [x] Inventario de equipos (alta, estado, baja, garantía).
- [x] Mantenimientos (preventivo/correctivo, programados, vencidos resaltados).
- [x] Tickets internos (folio TK-####, categoría, prioridad, ciclo de vida).
- [x] Dashboard con métricas + próximos mantenimientos + últimos tickets.
- [x] Auth Supabase + 3 capas de seguridad (middleware, server actions, RLS).
- [x] Tema claro/oscuro, gráficas SVG, todo en español.
- [x] Tokens de branding PIMSA documentados (aún no aplicados al CSS).

---

## Fase 1 — Pimsificar + datos reales 🔴

**Objetivo:** que el hub se vea y hable como PIMSA, con datos verdaderos.

- [x] 🔴 Aplicar paleta PIMSA en `app/globals.css` (remapear tokens): primario `#294466`, acento verde `#7F9D41`, variantes claras `#B0CD75`/`#517AAD`. Sin colores hardcodeados.
- [ ] 🔴 Reemplazar el seed de ejemplo (oficinas QRO/video) por **datos reales de PIMSA** en `schema.sql`: equipos reales (del inventario carpeta 01) y ubicaciones reales (Santa Catarina, planta/oficina).
- [x] 🟡 Integrar el **logo oficial** PIMSA (SVG) en sidebar y login (`public/pimsa-logo.svg` completo, `public/pimsa-isotipo.svg` para encabezados, favicon `app/icon.svg`).
- [ ] 🟡 Ajustar ubicaciones del inventario al sitio real (planta, oficinas, site/rack).

**Decisión resuelta:** Signika (marca oficial) se adoptó **solo en el portal del empleado**; el panel de TI conserva Geist.

---

## Fase 2 — Portal de tickets para el empleado 🔴

**Objetivo:** que cualquier trabajador de PIMSA levante un ticket en una sola pantalla, sin jerga de TI.

- [x] 🔴 Crear rutas del portal separadas del panel de TI (layout propio, sin sidebar, tipografía Signika). **Actualización:** el portal ahora es la página principal (`/`); el panel se movió a `/ti` con acceso discreto desde el pie del portal.
- [x] 🔴 Pantalla **crear ticket** (`/portal/nuevo`): pasos numerados — categoría como tarjetas en lenguaje claro, selección del equipo del empleado, resumen + detalles.
- [x] 🔴 Pantalla **mis tickets** (`/portal`): tarjetas con folio, estado amigable (Recibido / En atención / Resuelto) y barra de progreso de 3 pasos. Sin métricas ni jerga.
- [x] 🟡 Branding PIMSA visible (logo oficial, azul `#294466` + verde `#7F9D41`, filo verde en cabecera).
- [x] 🟡 Definir SLA básico (tiempos de respuesta por prioridad) y mostrarlo. **Hecho:** objetivos por prioridad (respuesta/resolución) en `lib/tickets.ts`, semáforo (en tiempo / por vencer / incumplido / pausado), columna SLA en la lista, métricas SLA en el detalle del ticket y resumen agregado en el dashboard. `en_espera` pausa el reloj.
- [ ] 🟢 Notificar a TI cuando entra un ticket nuevo (correo o Teams vía webhook/Power Automate).

**Cambios de esquema (hechos):**
- `tickets.solicitante_email` + `tickets.equipo_id` (FK a `equipos`) — el ticket queda ligado a su autor y al equipo reportado.
- `equipos.asignado_email` — vincula los equipos al correo del empleado; se captura desde el inventario del panel.
- `tickets.estado` ampliado a 6 estados tipo tablero: `abierto`, `en_proceso`, `en_espera`, `resuelto`, `cerrado`, `reabierto`.
- `tickets.asignado_email`, `tickets.primera_respuesta_at`, `tickets.resuelto_at` — sostienen la asignación y el cálculo de SLA (primera respuesta y resolución).

**Decisión resuelta — autenticación del portal:** *solo correo, sin contraseña ni magic link*.
El empleado escribe su correo una vez; queda en una cookie HttpOnly (`portal_correo`, scope `/portal`, 180 días).
El servidor consulta con la **service role key** (`SUPABASE_SERVICE_ROLE_KEY`, nunca expuesta al cliente)
filtrando siempre por ese correo; el RLS sigue cerrado para `anon`. Tradeoff aceptado: quien conozca el
correo de un compañero podría ver sus reportes (portal interno, fricción cero fue la prioridad).

---

## Fase 3 — Directorio de empleados y dispositivos 🟡

**Objetivo:** centralizar quién es quién, su contacto y qué equipo tiene. (Sustituye los CSV de directorio telefónico.)

- [x] 🟡 Nueva tabla `empleados`: nombre, correo (único), departamento, puesto, extensión, estado. Página `/ti/empleados` con alta, baja y equipos asignados por correo.
- [ ] 🟡 Pre-cargar los **36 empleados reales** (ya listados en `02-Administracion-M365/Usuarios-y-Licencias.csv`).
- [x] 🟡 Vincular equipos a empleados: la asignación en inventario es un **select de empleados** que guarda `asignado_a` (nombre) + `asignado_email` (vínculo). El correo es la llave, no hay FK dura (los registros históricos con texto libre siguen siendo válidos).
- [x] 🟡 **Inventario por categorías**: cómputo / celulares / líneas telefónicas / software en pestañas; celulares y líneas sin asignar se muestran "libres". (Pedido del usuario, adelantado de fase.)
- [ ] 🟢 Vista **directorio telefónico** (búsqueda por nombre/depto/extensión).
- [ ] 🟢 **Generador de firma de correo** por empleado (toma sus datos y produce el HTML de la firma estándar PIMSA).

**Cambios de esquema (hechos):** tabla `empleados`; `equipos.categoria` + `equipos.telefono`; check de `tipo` ampliado (celular, tablet, linea, software).

---

## Fase 4 — Proveedores, contratos y alertas 🟡

**Objetivo:** no perder renovaciones ni garantías.

- [ ] 🟡 Nueva tabla `proveedores`: nombre, servicio, contacto, teléfono, correo, costo, periodicidad, fecha de renovación.
- [ ] 🟡 Pre-cargar Microsoft (licencias M365) e ISP (internet).
- [ ] 🟢 **Alertas en dashboard**: contratos por renovar (próximos 30/60 días) y **garantías de equipos por vencer** (ya tenemos `garantia_hasta`).

**Cambios de esquema:** tabla `proveedores` (+ opcional `contratos`).

---

## Fase 5 — Mejoras operativas 🟢

- [ ] 🟢 Adjuntar **fotos a tickets** (Supabase Storage) — útil para reportar fallas.
- [ ] 🟢 **Exportar a CSV** inventario y tickets.
- [ ] 🟢 **Mantenimientos recurrentes** (cada N meses, autogenera el siguiente).
- [ ] 🟢 **Base de conocimiento / procedimientos**: checklists alta/baja de empleado (de `08-Procesos-y-Politicas`) accesibles desde la app.
- [x] 🟢 Histórico/bitácora de cambios por ticket (comentarios). **Hecho:** tabla `ticket_eventos` (comentario / estado / asignación / sistema), línea de tiempo en el detalle del ticket y registro automático en cada cambio de estado o asignación. Son notas internas: solo visibles en el panel de TI, nunca en el portal del empleado.

---

## Resumen de cambios de base de datos previstos

| Fase | Cambio en `schema.sql` |
|---|---|
| 1 | Reemplazar seed por datos PIMSA |
| 2 | ✅ `tickets.solicitante_email`, `tickets.equipo_id`, `equipos.asignado_email` (portal vía service role, sin políticas `anon`); ✅ estados ampliados + `asignado_email`, `primera_respuesta_at`, `resuelto_at` (SLA) |
| 3 | Tabla `empleados`; FK `equipos.asignado_a` y `tickets` → `empleados` |
| 4 | Tabla `proveedores` (y/o `contratos`) |
| 5 | Bucket de Storage para adjuntos; ✅ tabla `ticket_eventos` (bitácora/comentarios) |

## Decisiones abiertas (para resolver con el usuario)

1. ~~Autenticación del portal del empleado~~ → resuelta: solo correo en cookie (ver Fase 2).
2. ~~Tipografía~~ → resuelta: Signika en el portal, Geist en el panel.
3. **Notificaciones de ticket**: ¿correo, Teams, o ambos?
4. **Empleados como tabla** vs. seguir con texto libre en `asignado_a`/`solicitante` (en Fase 3 `equipos.asignado_email` migraría a FK de `empleados`).

---

## Orden de construcción recomendado

**Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5.**
La 1 es rápida y de alto impacto visual (se ve PIMSA). La 2 es el objetivo central (portal del empleado). La 3 habilita a la 4. La 5 es pulido.

---
_Última actualización: 2026-06-13_
