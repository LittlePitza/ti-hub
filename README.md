# TI Hub

Sitio interno del departamento de TI: **inventario de equipos**, **programación de mantenimientos** y **tickets de usuario**.

Stack: Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL) · listo para Vercel.

## Puesta en marcha (≈10 min)

### 1. Base de datos (Supabase)
1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito sirve).
2. Ve a **SQL Editor → New query**, pega el contenido completo de `supabase/schema.sql` y dale **Run**. Esto crea las 3 tablas, los índices, las políticas y datos de ejemplo.
3. En **Project Settings → API** copia la **Project URL** y la **anon public key**.

### 2. Local (opcional, para probar)
```bash
npm install
cp .env.example .env.local   # y llena las dos variables
npm run dev                  # http://localhost:3000
```

### 3. Despliegue en Vercel
1. Sube el proyecto a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo. Vercel detecta Next.js solo; no cambies nada.
3. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. Listo.

> Si despliegas sin las variables, el sitio carga igual y te muestra un aviso de configuración en lugar de tronar.

## Estructura

```
app/
  page.tsx                 Dashboard (métricas + próximos mantenimientos + últimos tickets)
  inventario/              Alta, cambio de estado y baja de equipos
  mantenimientos/          Programación, vencidos resaltados, historial
  tickets/                 Folios TK-0001, orden por prioridad, ciclo de vida
components/                Sidebar, insignias de estado, aviso de configuración
lib/supabase.ts            Cliente Supabase (lazy, tolera falta de env vars)
supabase/schema.sql        Esquema completo + seed — fuente de verdad de la BD
```

## Seguridad

Las políticas RLS actuales permiten acceso total con la anon key (uso interno).
Cuando quieras restringir: activa **Supabase Auth**, cambia las políticas de
`using (true)` a `to authenticated using (true)` y agrega login. Las tablas ya
tienen RLS habilitado, así que solo es cambiar políticas.

## Ideas de siguiente fase

- Login con Supabase Auth (correo del dominio de la empresa)
- Mantenimientos recurrentes (cada N meses) y avisos de garantía por vencer
- Adjuntar fotos a tickets con Supabase Storage
- Exportar inventario a CSV
