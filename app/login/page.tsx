import { iniciarSesion } from "./actions";
import BotonEnviar from "@/components/BotonEnviar";

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
  const mensaje = error ? (MENSAJES[error] ?? MENSAJES.credenciales) : null;

  return (
    <div className="login-marco">
      <div className="login-col">
        <div className="login-marca">
          <span className="login-logo-card">
            <span className="logo-claro">
              <img
                className="brand-iso"
                src="/pimsa-isotipo.svg"
                alt="Plásticos PIMSA"
                style={{ height: 44 }}
              />
            </span>
          </span>
          <p className="eyebrow login-eyebrow">Plásticos PIMSA · Sistemas</p>
        </div>

        <form className="login-caja" action={iniciarSesion}>
          <div className="login-caja-titulo">
            <h1>Iniciar sesión</h1>
            <p className="login-desc">
              Acceso restringido. Inicia sesión con tu cuenta del departamento.
            </p>
          </div>

          {mensaje && <div className="login-error">{mensaje}</div>}

          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <BotonEnviar className="boton press login-boton" ocupado="Entrando…">
            Entrar
          </BotonEnviar>
        </form>

        <p className="login-pie">TI Hub · Plásticos PIMSA</p>
      </div>
    </div>
  );
}
