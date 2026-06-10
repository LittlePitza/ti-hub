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
      <svg className="dona-svg" viewBox="0 0 100 100" role="img" aria-label={datos.map((d) => `${d.label}: ${d.valor}`).join(", ")}>
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
        <text x="50" y={unidad ? 49 : 54} textAnchor="middle" className="dona-total">{total}</text>
        {unidad && <text x="50" y="61" textAnchor="middle" className="dona-unidad">{unidad}</text>}
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

export function Barras({ datos }: { datos: DatoGrafica[] }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return <div className="grafica-vacia">Sin datos todavía</div>;

  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div className="barras">
      {datos.map((d) => (
        <div className="barra-fila" key={d.label}>
          <span className="barra-label" title={d.label}>{d.label}</span>
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
