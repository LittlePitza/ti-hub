import Link from "next/link";

export const metadata = { title: "Página no encontrada · TI Hub" };

// Root 404, reachable from both faces, so it stays neutral and links to the
// employee portal -- the public side. Uses the existing .vacio empty-state box.
export default function NoEncontrada() {
  return (
    <main className="shell">
      <div className="vacio" style={{ textAlign: "center" }}>
        <p className="eyebrow">Error 404</p>
        <h1>No encontramos esta página</h1>
        <p className="suave">El enlace puede estar mal escrito o el contenido ya no existe.</p>
        <p style={{ marginTop: 16 }}>
          <Link className="boton press" href="/">
            Ir al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}
