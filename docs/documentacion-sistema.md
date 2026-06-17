# Documentación del sistema — TI Hub · Plásticos PIMSA

> Documento fundamentado del sistema interno de TI de **Plásticos PIMSA** (Santa Catarina, N.L.).
> Dirigido a dirección/gerencia (justificación de las decisiones) y a los empleados que usan el portal.
> Las afirmaciones sobre niveles de servicio (SLA) están respaldadas por las referencias de la [sección 11](#11-referencias), citadas con la notación `[n]`.
>
> _Última actualización: 2026-06-17._

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Panorama del sistema](#2-panorama-del-sistema)
3. [El portal del empleado](#3-el-portal-del-empleado)
4. [El panel de TI](#4-el-panel-de-ti)
5. [Ciclo de vida de un ticket](#5-ciclo-de-vida-de-un-ticket)
6. [SLA — fundamento, cálculo y configuración](#6-sla--fundamento-cálculo-y-configuración)
7. [Seguridad](#7-seguridad)
8. [Notificaciones por correo](#8-notificaciones-por-correo)
9. [Datos, fuente de verdad y respaldo](#9-datos-fuente-de-verdad-y-respaldo)
10. [Glosario](#10-glosario)
11. [Referencias](#11-referencias)

---

## 1. Resumen ejecutivo

**TI Hub** es la herramienta operativa del día a día del departamento de TI de Plásticos PIMSA. Centraliza en un solo sitio lo que antes vivía disperso en hojas de cálculo y correos: el inventario de equipos, el directorio de empleados, los mantenimientos, los tickets de soporte y las cartas de resguardo (responsivas).

El sistema tiene **dos caras** que comparten la misma aplicación y la misma base de datos:

- **El portal del empleado** — la cara pública. Cualquier trabajador de PIMSA levanta un reporte de soporte en una sola pantalla, sin contraseñas ni jerga técnica, y sigue su avance.
- **El panel de TI** — la cara interna, protegida con inicio de sesión. El equipo de sistemas administra el inventario, atiende los tickets, programa mantenimientos y emite responsivas.

**El valor para PIMSA:** un único punto de verdad sobre los activos de TI y la atención al personal, con tiempos de respuesta medibles (SLA) que permiten evaluar y mejorar el servicio con datos, no con percepciones.

Lo que **no** vive en esta aplicación —configuración de seguridad de Microsoft 365, respaldos de infraestructura, red— queda documentado aparte; TI Hub es lo operativo del día a día.

---

## 2. Panorama del sistema

TI Hub es una aplicación web. No requiere instalación en las computadoras de los empleados: se abre desde el navegador.

### Arquitectura de alto nivel

```
   ┌─────────────────────────┐         ┌─────────────────────────┐
   │   PORTAL DEL EMPLEADO    │         │      PANEL DE TI         │
   │  (público, sin login)    │         │  (login obligatorio)     │
   │                          │         │                          │
   │  • Levantar reporte      │         │  • Inventario            │
   │  • Seguir mis reportes   │         │  • Empleados             │
   │  • Responder a TI        │         │  • Mantenimientos        │
   │                          │         │  • Tickets               │
   │                          │         │  • Responsivas           │
   │                          │         │  • Configuración correo  │
   └────────────┬─────────────┘         └────────────┬─────────────┘
                │                                     │
                └──────────────┬──────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │   Base de datos única    │
                  │   (Supabase / Postgres)  │
                  │  + almacenamiento de      │
                  │    fotos de los reportes  │
                  └──────────────────────────┘
```

### Componentes tecnológicos

| Componente | Tecnología | Para qué |
|---|---|---|
| Aplicación web | Next.js 15 + React 19 | La interfaz y la lógica, todo en un mismo proyecto |
| Base de datos | Supabase (PostgreSQL) | Guarda equipos, tickets, empleados, etc. |
| Almacenamiento | Supabase Storage | Las fotos que adjuntan los empleados a sus reportes |
| Autenticación del panel | Supabase Auth | Login de los usuarios de TI |
| Hospedaje | Vercel | Publica el sitio; se actualiza al subir cambios |

La elección de un solo proyecto que sirve ambas caras —en lugar de dos aplicaciones separadas— reduce el costo de mantenimiento y garantiza que el empleado y TI siempre vean datos consistentes (un ticket es el mismo registro para ambos).

---

## 3. El portal del empleado

El portal es la página principal del sitio. Está pensado para **fricción cero**: un trabajador de planta u oficina debe poder reportar un problema sin pedir ayuda para usarlo.

### Identidad sin contraseña

El empleado escribe su correo **una sola vez**. El sistema lo recuerda en el navegador (una cookie segura que dura 180 días). No hay contraseñas que olvidar ni cuentas que administrar. Esta decisión fue deliberada: la prioridad del portal es que cualquiera lo use de inmediato. (El tradeoff de seguridad de esta decisión se explica en la [sección 7](#7-seguridad).)

### Levantar un reporte

La pantalla de nuevo reporte guía por pasos:

1. **¿Qué tipo de problema es?** — categorías en lenguaje claro, no en jerga de TI.
2. **¿Qué equipo?** — el empleado elige entre los equipos asignados a su correo.
3. **Cuéntanos** — un resumen, la descripción y, opcionalmente, **fotos** del problema.

Al enviar, el reporte se convierte en un ticket con folio (por ejemplo `TK-0042`) y TI recibe un aviso por correo.

### Seguir mis reportes

El empleado ve sus reportes con un estado amigable y una **barra de progreso de 3 pasos**:

| Lo que ve el empleado | Significa |
|---|---|
| **Recibido** | TI ya tiene el reporte, aún no lo atiende |
| **En atención** | TI está trabajando en él |
| **Resuelto** | El problema quedó resuelto |

El empleado también puede **responder** a TI desde el portal (un hilo de conversación) y **reabrir** un reporte si el problema vuelve.

---

## 4. El panel de TI

El panel es el espacio de trabajo del equipo de sistemas. Requiere iniciar sesión. Agrupa los módulos por función:

### Inventario

Todos los activos de TI en **una sola tabla**, dividida por categoría:

- **Cómputo** — laptops, desktops, monitores, impresoras, servidores, red, periféricos.
- **Celulares** — teléfonos de la empresa.
- **Líneas telefónicas** — líneas con su compañía telefónica.
- **Software** — licencias.

Cada equipo registra marca, modelo, número de serie, ubicación, estado, garantía y a quién está asignado. Un celular o línea sin asignar aparece como **libre**.

### Empleados

Directorio del personal: nombre, correo (la llave que vincula equipos y tickets), departamento, puesto, extensión y estado. Sustituye los CSV de directorio telefónico.

### Mantenimientos

Preventivos y correctivos, programados con fecha. Los vencidos se resaltan para que no se pasen por alto.

### Tickets

La bandeja de soporte. Es el corazón operativo del panel y se detalla en las secciones [5](#5-ciclo-de-vida-de-un-ticket) y [6](#6-sla--fundamento-cálculo-y-configuración). Tiene dos vistas: **tablero** (estilo kanban, arrastrar y soltar entre estados) y **lista** (con filtros y la columna de SLA).

### Responsivas

Cartas de resguardo: el documento legal que firma un empleado al recibir un equipo bajo su custodia. Cada responsiva guarda un **"snapshot" congelado** de los datos del empleado y del equipo al momento de generarse, de modo que el documento legal no se altera si esos datos cambian después.

### Configuración de correo

Donde TI configura cómo se envían las notificaciones y **los tiempos de SLA** (ver secciones [6](#6-sla--fundamento-cálculo-y-configuración) y [8](#8-notificaciones-por-correo)).

---

## 5. Ciclo de vida de un ticket

Un ticket sigue un ciclo tipo **mesa de ayuda** (modelo estándar de la industria del soporte de TI [8]).

### Estados

| Estado | Significado | ¿Cuenta como trabajo activo? |
|---|---|---|
| **Abierto** | Recién llegado, sin atender | Sí |
| **En proceso** | TI está trabajando en él | Sí |
| **En espera** | Pausado esperando a un tercero o al solicitante | Sí (pero el reloj de SLA se pausa) |
| **Reabierto** | Volvió a abrirse tras un cierre | Sí |
| **Cerrado** | Trabajo terminado | No |
| **Archivado** | Guardado en frío, fuera de la vista | No |
| **Resuelto** | Estado heredado, equivalente a cerrado | No |

Para el empleado, estos siete estados internos se simplifican a tres ("Recibido / En atención / Resuelto"), como se vio en la [sección 3](#3-el-portal-del-empleado).

### Prioridades

Cada ticket tiene una prioridad que determina su urgencia y su SLA: **Crítica**, **Alta**, **Media** o **Baja**.

### Categorías

Para clasificar y reportar: hardware, software, red, accesos, correo y otro.

### Bitácora

Cada ticket conserva un historial completo: comentarios internos de TI, cambios de estado, reasignaciones, respuestas al solicitante y mensajes que el solicitante escribe desde el portal. Esto da trazabilidad: siempre se sabe quién hizo qué y cuándo.

---

## 6. SLA — fundamento, cálculo y configuración

Esta es la sección central del documento. Explica qué es el SLA, **de dónde salen los valores** que usa PIMSA, cómo se calculan y cómo se ajustan.

### 6.1 ¿Qué es un SLA?

Un **SLA** (*Service Level Agreement*, acuerdo de nivel de servicio) es el compromiso de cuánto tiempo máximo tardará TI en atender un problema, según su urgencia. Sirve para dos cosas:

1. **Fijar expectativas**: el empleado sabe qué esperar; TI sabe qué cumplir.
2. **Medir el servicio**: permite saber, con datos, si TI está cumpliendo o no.

La buena práctica de la industria recomienda que las políticas de SLA estén **gobernadas por la prioridad del ticket** y que los tiempos sean **realistas según los recursos disponibles**, no aspiracionales [9][12].

### 6.2 Las dos métricas que mide TI Hub

TI Hub mide dos tiempos distintos por cada ticket, una distinción estándar en la gestión de servicios [10][11]:

| Métrica | Qué mide | Por qué importa |
|---|---|---|
| **Tiempo de primera respuesta** | Desde que entra el ticket hasta el **primer contacto** de TI | Es el acuse de recibo. El solicitante se frustra menos en cuanto sabe que alguien ya está viendo su caso [9]. |
| **Tiempo de resolución** | Desde que entra el ticket hasta que **queda resuelto** | Es lo que de verdad le importa al solicitante: que su problema se solucione, no solo que le contesten rápido [11]. |

### 6.3 De dónde salen los valores: la matriz de prioridad ITIL

El marco **ITIL** (el estándar de facto para la gestión de servicios de TI) define la prioridad de un incidente combinando dos factores en una **matriz de impacto × urgencia** [1][4][5]:

- **Impacto** — el alcance del daño: ¿afecta a una persona, a un área o a toda la planta? [2]
- **Urgencia** — qué tan rápido se necesita la solución [2].

```
                        URGENCIA
                 Alta      Media     Baja
            ┌─────────┬─────────┬─────────┐
       Alto │ Crítica │  Alta   │  Media  │
  I         ├─────────┼─────────┼─────────┤
  M    Medio│  Alta   │  Media  │  Media  │
  P         ├─────────┼─────────┼─────────┤
  A    Bajo │  Media  │  Media  │  Baja   │
  C         └─────────┴─────────┴─────────┘
  T
  O     Alto impacto + alta urgencia = Crítica (P1)
        Bajo impacto + baja urgencia = Baja (P4)   [1][3]
```

A cada prioridad ITIL le corresponde un tiempo objetivo de respuesta y de resolución [3].

### 6.4 Valores adoptados en PIMSA vs. benchmarks de la industria

TI Hub usa los siguientes objetivos (en **horas de reloj**, no horas hábiles), comparados con los rangos que recomiendan las referencias de la industria:

| Prioridad | Respuesta PIMSA | Resolución PIMSA | Benchmark respuesta [6][7] | Benchmark resolución [6][7] |
|---|---|---|---|---|
| **Crítica** | 1 h | 4 h | 15–30 min | 2–4 h |
| **Alta** | 4 h | 24 h | 1–2 h | 4–8 h (o 1 día hábil) |
| **Media** | 8 h | 48 h | 4–8 h | 24–48 h |
| **Baja** | 24 h | 96 h | 24 h (1 día hábil) | 72–120 h (3–5 días) |

**Justificación de los valores de PIMSA:**

- **Son realistas para el contexto**, como recomienda la buena práctica [9][12]. PIMSA es una planta de manufactura con un **equipo de TI pequeño**; los benchmarks más agresivos (respuesta crítica de 15 minutos) suponen mesas de ayuda con personal dedicado y guardias 24/7, que no es el caso.
- **Se miden en horas de reloj corridas**, no en horario hábil. Esto es más estricto y más simple de comunicar: una hora es una hora, sin calendarios de por medio.
- **La resolución de crítica (4 h) sí cae dentro del benchmark** [6], lo que protege los casos que detienen la operación.
- **La respuesta de crítica (1 h) es más holgada que el ideal** (15–30 min). Es una concesión consciente al tamaño del equipo. Como el sistema permite ajustar este valor (ver 6.6), puede endurecerse cuando los recursos lo permitan.

> **Importante:** estos son los valores **predeterminados** del sistema. TI los puede modificar en cualquier momento desde el panel sin tocar el código (ver 6.6).

### 6.5 Cómo se calcula el semáforo

Para cada ticket, TI Hub compara el tiempo transcurrido contra el objetivo de su prioridad y muestra un **semáforo**:

| Semáforo | Cuándo aparece | Color |
|---|---|---|
| **En tiempo** | El tiempo transcurrido va por debajo del 80 % del objetivo | Verde |
| **Por vencer** | El tiempo transcurrido está entre el 80 % y el 100 % del objetivo | Naranja |
| **Fuera de SLA** | Se superó el objetivo | Rojo |
| **En SLA / Cumplido** | El ticket se atendió/resolvió dentro del objetivo | Verde |
| **En pausa** | El ticket está "En espera"; el reloj se detiene | Gris |

Dos reglas importantes:

- **El umbral del 80 %** es el punto donde el semáforo pasa de verde a naranja para avisar con anticipación. Es configurable.
- **La pausa del reloj**: cuando un ticket está "En espera" (por ejemplo, esperando una pieza o la respuesta del empleado), el cronómetro se detiene. Así no se penaliza a TI por demoras que no dependen de ellos, una práctica habitual en las mesas de ayuda [11].

### 6.6 Configuración desde el panel

Todos los valores de SLA son **configurables sin programar**, desde el panel de TI, en la sección de configuración de correo → **"Tiempos de respuesta (SLA)"**:

- Los ocho objetivos (respuesta y resolución de cada una de las cuatro prioridades).
- El umbral de "por vencer" (%).

Si un campo se deja vacío, el sistema usa el valor predeterminado fundamentado en 6.4. Los valores guardados se aplican de inmediato en toda la aplicación: la lista de tickets, el tablero, el detalle de cada ticket y las métricas del resumen.

### 6.7 Meta de cumplimiento

La industria sugiere mantener una tasa de cumplimiento de **95 % o superior** en los SLA de respuesta, ajustada por organización y prioridad [7][12]. El dashboard de TI Hub muestra el porcentaje de tickets atendidos y resueltos dentro del SLA, lo que permite vigilar este indicador y detectar cuándo el equipo necesita más recursos o cuándo los objetivos deben recalibrarse.

---

## 7. Seguridad

El panel de TI está protegido en **tres capas**, de modo que un fallo en una no compromete el sistema:

1. **Control de acceso a las rutas** — el sistema exige sesión iniciada para entrar a cualquier pantalla del panel; si no la hay, redirige al login.
2. **Verificación en cada operación** — antes de escribir cualquier dato, se vuelve a comprobar que hay un usuario válido.
3. **Seguridad a nivel de base de datos (RLS)** — la propia base de datos (PostgreSQL con *Row Level Security*) rechaza cualquier lectura o escritura que no venga de un usuario autenticado. Es la última línea y la más robusta.

**No hay registro público de usuarios de TI**: las cuentas se dan de alta manualmente. El portal del empleado, en cambio, es público por diseño y su identidad es la cookie de correo.

**Tradeoff aceptado del portal:** como el portal identifica al empleado solo por su correo (sin contraseña), alguien que conozca el correo de un compañero podría, en teoría, ver los reportes de esa persona. Se aceptó conscientemente: es un portal interno y la prioridad de negocio fue la fricción cero. La base de datos sigue cerrada al público anónimo; el portal accede a los datos a través del servidor, filtrando siempre por el correo del empleado.

---

## 8. Notificaciones por correo

TI Hub envía notificaciones por correo. **Todo se configura desde el panel**, no por archivos técnicos.

- **Aviso de ticket nuevo** — cuando un empleado levanta un reporte, TI recibe un correo con el resumen y un enlace directo.
- **Respuestas y cambios de estado** — TI puede notificar al solicitante desde cada ticket, con plantillas editables.

Hay tres métodos de envío, pensados para la transición de Microsoft 365 (que retira la contraseña básica por SMTP a fin de 2026):

| Método | Descripción | Recomendado |
|---|---|---|
| **Conexión de app (Graph)** | Sin contraseña, no caduca; manda desde un buzón fijo | ✅ Sí |
| **Iniciar sesión con Microsoft** | Inicia sesión y manda como esa cuenta | Alternativa |
| **SMTP básico** | Usuario y contraseña (legado, funciona hasta dic. 2026) | Solo transición |

Los enlaces de los correos **no tienen el dominio escrito en el código**: se derivan de la configuración del panel, de modo que cambiar de dominio no requiere tocar el sistema.

---

## 9. Datos, fuente de verdad y respaldo

### Dónde viven los datos

Todos los datos (equipos, empleados, tickets, responsivas, configuración) viven en una base de datos **PostgreSQL administrada por Supabase**. Las fotos de los reportes viven en el almacenamiento de Supabase.

### La estructura de la base es código

El diseño de la base de datos está definido en un archivo versionado (`supabase/schema.sql`) que actúa como **fuente de verdad**. Toda modificación a la estructura pasa por ahí. Esto significa que la forma de la base de datos siempre se puede reconstruir y auditar.

Las tablas principales son: `empleados`, `equipos`, `mantenimientos`, `tickets`, `ticket_eventos` (la bitácora), `responsivas`, `plantillas_responsiva` y `config_correo` (que incluye los tiempos de SLA).

### Qué NO vive en TI Hub

Por diseño, quedan fuera de esta aplicación y se administran aparte: la configuración de seguridad de Microsoft 365 (MFA, roles), los respaldos de infraestructura y la red. TI Hub cubre lo operativo del día a día.

---

## 10. Glosario

| Término | Definición |
|---|---|
| **SLA** | *Service Level Agreement*. Compromiso de tiempo máximo de atención según la prioridad. |
| **Primera respuesta** | El primer contacto de TI con el solicitante tras levantarse un ticket. |
| **Resolución** | El momento en que el problema del ticket queda solucionado. |
| **Prioridad** | Nivel de urgencia de un ticket (Crítica, Alta, Media, Baja), derivado del impacto y la urgencia. |
| **Semáforo (SLA)** | Indicador visual de si un ticket va en tiempo, por vencer o fuera de SLA. |
| **Ticket** | Un reporte de soporte. En el portal se le llama "reporte". |
| **Folio** | Identificador legible de un ticket (`TK-####`) o responsiva. |
| **Responsiva** | Carta de resguardo: documento legal de custodia de un equipo. |
| **Bitácora** | Historial de eventos de un ticket. |
| **RLS** | *Row Level Security*. Seguridad aplicada por la base de datos a nivel de cada fila. |
| **ITIL** | Conjunto de buenas prácticas estándar para la gestión de servicios de TI. |
| **Portal** | La cara pública del sistema, para los empleados. |
| **Panel** | La cara interna del sistema, para el equipo de TI. |

---

## 11. Referencias

Fuentes consultadas para fundamentar los criterios de SLA y la gestión de incidentes de este documento (consultadas en junio de 2026):

1. TOPdesk — *ITIL Incident Priority Matrix*. https://www.topdesk.com/en/blog/incident-priority-matrix/
2. NovelVista — *ITIL Incident Priority Matrix: Impact & Urgency Explained*. https://www.novelvista.com/blogs/it-service-management/itil-incident-priority-matrix
3. PagerDuty — *Using the Incident Priority Matrix*. https://www.pagerduty.com/resources/digital-operations/learn/incident-priority-matrix/
4. InvGate — *ITIL Priority Matrix: How to Build And Use It in Your Service Desk*. https://blog.invgate.com/itil-priority-matrix
5. IT Process Wiki — *Checklist Incident Priority*. https://wiki.en.it-processmaps.com/index.php/Checklist_Incident_Priority
6. Email Meter — *SLA Response Time Benchmarks: P1 to P4 + How to Track Compliance*. https://www.emailmeter.com/blog/understanding-industry-standard-sla-response-times
7. Shyft — *Industry Benchmarks: Optimizing IT Support Response Across Shifts*. https://www.myshyft.com/blog/it-support-response-benchmarks/
8. InvGate — *5 ITIL Standards and Best Practices For Your Service Desk*. https://blog.invgate.com/itil-standards-and-best-practices
9. Freshworks — *What Is SLA Response Time & Why It Matters: A Complete Guide*. https://www.freshworks.com/itsm/sla/response-time/
10. Atlassian Community — *Understanding SLA metrics: Time to resolution, time to first response, and more*. https://community.atlassian.com/forums/App-Central-articles/Understanding-SLA-metrics-Time-to-resolution-time-to-first/ba-p/2715307
11. EasyDesk — *SLA Response Time vs Resolution Time Explained*. https://easydesk.app/blog/sla-response-time-vs-resolution-time
12. Freshworks — *SLA Metrics: How to Measure & Monitor SLA Performance*. https://www.freshworks.com/itsm/sla/metrics/

> Metodología de esta documentación: estructurada según el marco **Diátaxis** (https://diataxis.fr/), combinando explicación (entender y justificar) con referencia (valores y tablas).
