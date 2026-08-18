// Gráficas server-rendered en SVG/CSS puro. Los colores usan las variables
// del tema, así que funcionan en modo claro y noche sin cambios.

export type DatoGrafica = { label: string; valor: number; tono: string };

const TONOS: Record<string, string> = {
  ok: "var(--ok)",
  aviso: "var(--aviso)",
  critico: "var(--critico)",
  info: "var(--petroleo)",
  neutro: "var(--tinta-suave)",
};

export function Dona({ datos, unidad }: { datos: DatoGrafica[]; unidad?: string }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return <div className="grafica-vacia">Sin datos todavía</div>;

  const R = 40;
  const C = 2 * Math.PI * R;
  let recorrido = 0;
  const segmentos = datos
    .filter((d) => d.valor > 0)
    .map((d) => {
      const largo = (d.valor / total) * C;
      const seg = { ...d, largo, inicio: recorrido };
      recorrido += largo;
      return seg;
    });

  return (
    <div className="dona">
      <svg
        className="dona-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={datos.map((d) => `${d.label}: ${d.valor}`).join(", ")}
      >
        {segmentos.map((s) => (
          <circle
            key={s.label}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={TONOS[s.tono] ?? TONOS.neutro}
            strokeWidth="13"
            strokeDasharray={`${s.largo} ${C - s.largo}`}
            strokeDashoffset={-s.inicio}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x="50" y={unidad ? 49 : 54} textAnchor="middle" className="dona-total">
          {total}
        </text>
        {unidad && (
          <text x="50" y="61" textAnchor="middle" className="dona-unidad">
            {unidad}
          </text>
        )}
      </svg>
      <ul className="dona-leyenda">
        {datos.map((d) => (
          <li key={d.label}>
            <span className="punto" style={{ background: TONOS[d.tono] ?? TONOS.neutro }} />
            <span>{d.label}</span>
            <span className="mono">{d.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tendencia mensual con dos series lado a lado (p. ej. tickets creados vs
// resueltos). Columnas verticales porque el eje X es tiempo; las etiquetas
// van abajo y el valor encima de cada columna.
export type PuntoColumnas = { label: string; a: number; b: number };

export function Columnas({
  datos,
  serieA,
  serieB,
  tonoA = "info",
  tonoB = "ok",
}: {
  datos: PuntoColumnas[];
  serieA: string;
  serieB: string;
  tonoA?: string;
  tonoB?: string;
}) {
  const max = Math.max(...datos.map((d) => Math.max(d.a, d.b)), 1);
  if (datos.every((d) => d.a === 0 && d.b === 0))
    return <div className="grafica-vacia">Sin datos todavía</div>;

  // Geometría del lienzo: área de dibujo de 150px de alto; las columnas de cada
  // mes van pegadas en par, centradas en su celda.
  const ANCHO = 560;
  const ALTO = 196;
  const BASE = 158; // y de la línea base
  const ALTO_MAX = 128; // alto de la columna más alta
  const celda = ANCHO / datos.length;
  const barra = Math.min(20, celda / 3.2);

  const altura = (v: number) => (v === 0 ? 0 : Math.max((v / max) * ALTO_MAX, 3));
  const colorA = TONOS[tonoA] ?? TONOS.neutro;
  const colorB = TONOS[tonoB] ?? TONOS.neutro;

  return (
    <div className="columnas">
      <svg
        className="columnas-svg"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={datos.map((d) => `${d.label}: ${serieA} ${d.a}, ${serieB} ${d.b}`).join("; ")}
      >
        <line x1="0" y1={BASE} x2={ANCHO} y2={BASE} className="columnas-eje" />
        {datos.map((d, i) => {
          const cx = celda * i + celda / 2;
          const hA = altura(d.a);
          const hB = altura(d.b);
          return (
            <g key={d.label + i}>
              <rect
                x={cx - barra - 1.5}
                y={BASE - hA}
                width={barra}
                height={hA}
                rx="3"
                fill={colorA}
              />
              <rect x={cx + 1.5} y={BASE - hB} width={barra} height={hB} rx="3" fill={colorB} />
              <text
                x={cx - barra / 2 - 1.5}
                y={BASE - hA - 5}
                textAnchor="middle"
                className="columnas-valor"
              >
                {d.a}
              </text>
              <text
                x={cx + barra / 2 + 1.5}
                y={BASE - hB - 5}
                textAnchor="middle"
                className="columnas-valor"
              >
                {d.b}
              </text>
              <text x={cx} y={BASE + 20} textAnchor="middle" className="columnas-mes">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="columnas-leyenda">
        <li>
          <span className="punto" style={{ background: colorA }} />
          <span>{serieA}</span>
        </li>
        <li>
          <span className="punto" style={{ background: colorB }} />
          <span>{serieB}</span>
        </li>
      </ul>
    </div>
  );
}

export function Barras({ datos }: { datos: DatoGrafica[] }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return <div className="grafica-vacia">Sin datos todavía</div>;

  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="barras">
      {datos.map((d) => (
        <div className="barra-fila" key={d.label}>
          <span className="barra-label" title={d.label}>
            {d.label}
          </span>
          <div className="barra-pista">
            <div
              className="barra-relleno"
              style={{
                width: d.valor === 0 ? 0 : `${Math.max((d.valor / max) * 100, 4)}%`,
                background: TONOS[d.tono] ?? TONOS.neutro,
              }}
            />
          </div>
          <span className="barra-valor mono">{d.valor}</span>
        </div>
      ))}
    </div>
  );
}
