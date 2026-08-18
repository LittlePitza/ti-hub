export default function SinConexion() {
  return (
    <div className="vacio">
      <strong>Base de datos sin configurar</strong>
      Crea <code>.env.local</code> con <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, y ejecuta <code>supabase/schema.sql</code> en tu
      proyecto de Supabase. En Vercel, agrégalas en Settings → Environment Variables.
    </div>
  );
}
