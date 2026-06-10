import { iniciarSesion } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES: Record<string, string> = {
  credenciales: "Correo o contraseña incorrectos.",
  config: "Base de datos sin configurar; no es posible iniciar sesión.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mensaje = error ? MENSAJES[error] ?? MENSAJES.credenciales : null;

  return (
    <div className="login-marco">
      <form className="login-caja" action={iniciarSesion}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <div className="brand-name">TI Hub</div>
          <div className="brand-sub">depto. sistemas</div>
        </div>
        <p className="login-desc">Acceso restringido. Inicia sesión con tu cuenta del departamento.</p>

        {mensaje && <div className="login-error">{mensaje}</div>}

        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>

        <button type="submit" className="boton login-boton">Entrar</button>
      </form>
    </div>
  );
}
