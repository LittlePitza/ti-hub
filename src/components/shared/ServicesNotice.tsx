import { getPortalSupabase } from "@/lib/supabase/client";
import { servicesWithStatus, type Service, type Incident } from "@/lib/domain/services";

// Banner for the employee portal: announces when a service flagged
// `visible_portal` has an open outage or fault, so a worker knows IT is already
// aware and does not file a duplicate report. This is global information (not
// per employee), so it carries no email filter; it shows only active, visible
// services, and never the incident's internal `descripcion`.
export default async function ServicesNotice() {
  const sb = getPortalSupabase();
  if (!sb) return null;

  const [serviciosQ, incidentesQ] = await Promise.all([
    sb.from("servicios").select("*").eq("activo", true).eq("visible_portal", true),
    sb.from("incidentes").select("*").neq("estado", "resuelto"),
  ]);

  const servicios = (serviciosQ.data ?? []) as Service[];
  const incidentes = (incidentesQ.data ?? []) as Incident[];
  const afectados = servicesWithStatus(servicios, incidentes).filter(
    (s) => s.estado.value !== "operativo",
  );
  if (afectados.length === 0) return null;

  const hayCaido = afectados.some((s) => s.estado.value === "caido");

  return (
    <section className={`portal-aviso ${hayCaido ? "critico" : "aviso"}`} role="status">
      <span className="portal-aviso-icono" aria-hidden>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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
              <span className={`estado-punto ${s.estado.tone}`} aria-hidden />
              <b>{s.servicio.nombre}</b>
              <span className="portal-aviso-estado">{s.estado.label}</span>
              {s.incidentesAbiertos[0] && (
                <span className="portal-aviso-detalle">— {s.incidentesAbiertos[0].titulo}</span>
              )}
            </li>
          ))}
        </ul>
        <span className="portal-aviso-nota">
          El equipo de TI ya está trabajando en ello. No necesitas reportarlo.
        </span>
      </div>
    </section>
  );
}
