import { getSupabasePortal } from "@/lib/supabase";
import { serviciosConEstado, type Servicio, type Incidente } from "@/lib/servicios";

// Franja para el portal del empleado: avisa cuando un servicio marcado como
// `visible_portal` tiene una caída/falla abierta, para que el trabajador sepa que
// TI ya está al tanto y no levante un reporte duplicado. Es información global (no
// por empleado), así que no lleva filtro por correo; solo muestra servicios activos
// y visibles, y nunca la `descripcion` interna del incidente.
export default async function AvisoServicios() {
  const sb = getSupabasePortal();
  if (!sb) return null;

  const [serviciosQ, incidentesQ] = await Promise.all([
    sb.from("servicios").select("*").eq("activo", true).eq("visible_portal", true),
    sb.from("incidentes").select("*").neq("estado", "resuelto"),
  ]);

  const servicios = (serviciosQ.data ?? []) as Servicio[];
  const incidentes = (incidentesQ.data ?? []) as Incidente[];
  const afectados = serviciosConEstado(servicios, incidentes).filter((s) => s.estado.valor !== "operativo");
  if (afectados.length === 0) return null;

  const hayCaido = afectados.some((s) => s.estado.valor === "caido");

  return (
    <section className={`portal-aviso ${hayCaido ? "critico" : "aviso"}`} role="status">
      <span className="portal-aviso-icono" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div className="portal-aviso-cuerpo">
        <strong className="portal-aviso-titulo">
          {afectados.length === 1
            ? "Hay un servicio con problemas"
            : `Hay ${afectados.length} servicios con problemas`}
        </strong>
        <ul className="portal-aviso-lista">
          {afectados.map((s) => (
            <li key={s.servicio.id}>
              <span className={`estado-punto ${s.estado.tono}`} aria-hidden />
              <b>{s.servicio.nombre}</b>
              <span className="portal-aviso-estado">{s.estado.etiqueta}</span>
              {s.incidentesAbiertos[0] && (
                <span className="portal-aviso-detalle">— {s.incidentesAbiertos[0].titulo}</span>
              )}
            </li>
          ))}
        </ul>
        <span className="portal-aviso-nota">El equipo de TI ya está trabajando en ello. No necesitas reportarlo.</span>
      </div>
    </section>
  );
}
