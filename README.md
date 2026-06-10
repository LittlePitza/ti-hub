# TI Hub

Sitio interno del departamento de TI: **inventario de equipos**, **programación de mantenimientos** y **tickets de usuario**. Todo el sitio requiere iniciar sesión (Supabase Auth).

Stack: Next.js 15 (App Router) · React 19 · Supabase (PostgreSQL + Auth) · listo para Vercel.

## Puesta en marcha (≈10 min)

### 1. Base de datos (Supabase)
1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito sirve).
2. Ve a **SQL Editor → New query**, pega el contenido completo de `supabase/schema.sql` y dale **Run**. Esto crea las 3 tablas, los índices, las políticas y datos de ejemplo.
3. En **Authentication → Users → Add user** crea las cuentas del equipo (correo y contraseña; marca **Auto Confirm User**). No hay registro público: solo entra quien des de alta aquí.
4. En **Project Settings → API** copia la **Project URL** y la **anon public key**.

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
middleware.ts              Sin sesión todo redirige a /login (y refresca el token)
app/
  login/                   Inicio de sesión (email/contraseña de Supabase Auth)
  (panel)/                 Páginas protegidas, con sidebar y guard de sesión
    page.tsx               Dashboard (métricas + próximos mantenimientos + últimos tickets)
    inventario/            Alta, cambio de estado y baja de equipos
    mantenimientos/        Programación, vencidos resaltados, historial
    tickets/               Folios TK-0001, orden por prioridad, ciclo de vida
components/                Sidebar, insignias de estado, aviso de configuración
lib/supabase.ts            Cliente Supabase por petición, ligado a cookies (@supabase/ssr)
supabase/schema.sql        Esquema completo + seed — fuente de verdad de la BD
```

## Seguridad

Tres capas, todas exigen sesión de Supabase Auth:

1. **Middleware**: sin sesión válida, cualquier ruta redirige a `/login`.
2. **Server actions**: verifican el usuario (`getSupabaseAutenticado`) antes de escribir.
3. **RLS**: las políticas son `to authenticated` — la anon key sin sesión no puede
   leer ni escribir ninguna tabla, aunque alguien la extraiga del navegador.

Los usuarios se administran a mano en el dashboard de Supabase (**Authentication → Users**);
no hay página de registro, es deliberado por ser herramienta interna.

## Ideas de siguiente fase

- Mantenimientos recurrentes (cada N meses) y avisos de garantía por vencer
- Adjuntar fotos a tickets con Supabase Storage
- Exportar inventario a CSV
