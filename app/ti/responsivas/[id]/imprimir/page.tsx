import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Poppins } from "next/font/google";
import { getSupabase } from "@/lib/supabase";
import { fechaCorta, folioResponsiva } from "@/lib/format";
import { categoriaInv } from "@/lib/inventario";
import { fusionarPlantilla, CAMPOS_EQUIPO_TODOS, type DatosResponsiva, type PersonaResp } from "@/lib/responsivas";
import BotonImprimir from "@/components/BotonImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir responsiva" };

// Tipografía de la marca PIMSA (igual que el resto de la app).
const signika = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

const RAZON_SOCIAL = "Plásticos PIMSA";

// Renderiza pares etiqueta/valor en filas de 2 columnas (table.datos).
function FilasDatos({ pares }: { pares: [string, string][] }) {
  const filas: [string, string][][] = [];
  for (let i = 0; i < pares.length; i += 2) filas.push(pares.slice(i, i + 2));
  return (
    <table className="datos">
      <tbody>
        {filas.map((fila, i) => (
          <tr key={i}>
            {fila.map(([k, v]) => (
              <Fragment key={k}>
                <th>{k}</th>
                <td>{v || " "}</td>
              </Fragment>
            ))}
            {fila.length === 1 && <><th /><td /></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Casillas({ items, marcados }: { items: string[]; marcados: string[] }) {
  return (
    <div className="casillas">
      {items.map((it) => (
        <span key={it} className="casilla">
          <span className={`box ${marcados.includes(it) ? "marcado" : ""}`} />
          {it}
        </span>
      ))}
    </div>
  );
}

export default async function ImprimirResponsiva({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await getSupabase();
  if (!sb) notFound();

  const { data: r } = await sb.from("responsivas").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const overrideQ = await sb.from("plantillas_responsiva").select("*").eq("clave", r.plantilla).maybeSingle();
  const pl = fusionarPlantilla(r.plantilla, overrideQ.data);
  const datos = (r.datos ?? {}) as DatosResponsiva;
  const personas = (r.personas ?? []) as PersonaResp[];
  const eq = datos.equipo;
  const folio = folioResponsiva(pl.prefijoFolio, r.num);
  const anio = new Date().getFullYear();
  const c = categoriaInv(eq?.categoria).campos;
  const esDevolucion = r.plantilla === "devolucion";

  // Datos del colaborador
  const paresColab: [string, string][] = [
    ["Nombre completo", r.empleado_nombre ?? ""],
    ["Puesto", r.empleado_puesto ?? ""],
    ["Área / Departamento", r.empleado_departamento ?? ""],
    ["Correo institucional", r.empleado_correo ?? ""],
    [esDevolucion ? "Fecha de devolución" : "Fecha de entrega", fechaCorta(r.fecha_entrega ?? r.fecha_generada)],
  ];

  // Identificación del activo. El nombre siempre sale; el resto de campos sólo
  // si la categoría los usa Y la plantilla los tiene marcados como visibles.
  const visibles = new Set(pl.camposEquipo ?? CAMPOS_EQUIPO_TODOS);
  const paresActivo: [string, string][] = [
    [esDevolucion ? "Activo" : c.nombre.label, r.equipo_nombre ?? ""],
  ];
  if (c.marca && visibles.has("marca")) paresActivo.push([c.marca.label, eq?.marca ?? ""]);
  if (c.modelo && visibles.has("modelo")) paresActivo.push([c.modelo.label, eq?.modelo ?? ""]);
  if (c.num_serie && visibles.has("num_serie")) paresActivo.push([c.num_serie.label, eq?.num_serie ?? ""]);
  if (c.telefono && visibles.has("telefono")) paresActivo.push([c.telefono.label, eq?.telefono ?? ""]);
  if (c.ubicacion && visibles.has("ubicacion")) paresActivo.push(["Ubicación", eq?.ubicacion ?? ""]);
  if (c.fechas && visibles.has("fecha_compra")) paresActivo.push(["Fecha de compra", fechaCorta(eq?.fecha_compra)]);
  if (c.fechas && visibles.has("garantia_hasta")) paresActivo.push([c.garantiaLabel, fechaCorta(eq?.garantia_hasta)]);

  return (
    <div className={`responsiva-doc ${signika.className}`}>
      <div className="barra-print no-print">
        <Link href={`/ti/responsivas/${r.id}`} className="boton secundario">← Volver</Link>
        <BotonImprimir />
      </div>

      <div className="hoja">
        <header className="encabezado">
          <div className="logo">
            <span className="logo-claro">
              <img src="/pimsa-logo.png" alt="Plásticos PIMSA" />
            </span>
            <div className="sub">{RAZON_SOCIAL}</div>
          </div>
          <div className="titulo">
            <h1>{esDevolucion ? "Acta de Devolución de Activos" : "Carta Responsiva de Resguardo"}</h1>
            <div className="tipo">{pl.titulo}</div>
          </div>
          <div className="control">
            <span className="et">Código</span><span>{pl.codigo}</span>
            <span className="et">Versión</span><span>{overrideQ.data?.version ?? "1.0"}</span>
            <span className="et">Vigencia</span><span>{anio}</span>
            <span className="et">Hoja</span><span>1 de 1</span>
          </div>
        </header>

        <p className="folio">FOLIO DE RESGUARDO: <span>{folio}</span></p>

        <section className="seccion">
          <h2>1. Datos del colaborador responsable</h2>
          <FilasDatos pares={paresColab} />
        </section>

        {personas.length > 0 && (
          <section className="seccion">
            <h2>Personas adicionales del resguardo</h2>
            <table className="datos">
              <tbody>
                {personas.map((p, i) => (
                  <tr key={i}>
                    <th>{p.rol || "Persona"}</th>
                    <td>{[p.nombre, p.puesto, p.departamento].filter(Boolean).join(" · ") || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="seccion">
          <h2>2. Identificación del activo (ISO/IEC 27001:2022 — A.5.9)</h2>
          <FilasDatos pares={paresActivo} />
        </section>

        {pl.accesorios.length > 0 && (
          <section className="seccion">
            <h2>3. Accesorios entregados</h2>
            <Casillas items={pl.accesorios} marcados={datos.accesorios ?? []} />
          </section>
        )}

        {pl.seguridad.length > 0 && (
          <section className="seccion">
            <h2>{esDevolucion ? "Verificación técnica de baja" : "Configuración de seguridad (A.8.1)"}</h2>
            <Casillas items={pl.seguridad} marcados={datos.seguridad ?? []} />
          </section>
        )}

        <section className="seccion">
          <h2>Estado físico y observaciones</h2>
          <table className="datos">
            <tbody>
              <tr><th>Estado físico</th><td>{datos.estado_fisico || " "}</td></tr>
              <tr><th>Observaciones</th><td style={{ height: 30 }}>{datos.observaciones || " "}</td></tr>
            </tbody>
          </table>
        </section>

        {pl.clausulas.length > 0 && (
          <section className="seccion">
            <h2>Declaración de responsabilidad y condiciones de uso</h2>
            <div className="clausulas">
              <ol>
                {pl.clausulas.map((cl) => (
                  <li key={cl.titulo}><b>{cl.titulo}.</b> {cl.texto}</li>
                ))}
              </ol>
              {pl.aviso && <div className="aviso">{pl.aviso}</div>}
            </div>
          </section>
        )}

        {pl.clausulas.length === 0 && pl.aviso && (
          <section className="seccion">
            <div className="aviso">{pl.aviso}</div>
          </section>
        )}

        <section className="seccion">
          <div className={`firmas ${pl.firmas.length === 2 ? "dos" : ""}`}>
            {pl.firmas.map((f) => (
              <div className="firma" key={f.titulo}>
                <div className="linea" />
                <div className="nombre">{f.titulo}</div>
                <div className="rol">{f.nota}</div>
              </div>
            ))}
          </div>

          {/* Un renglón de firma por persona adicional: su nombre impreso sobre
              la línea (para que firme encima) y el rol debajo. */}
          {personas.length > 0 && (
            <div className="firmas firmas-personas">
              {personas.map((p, i) => (
                <div className="firma" key={i}>
                  <div className="firma-nombre-print">{p.nombre}</div>
                  <div className="linea" />
                  <div className="rol">{p.rol || "Nombre y firma"}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="pie">
          <div className="iso"><b>{pl.iso}</b></div>
          <div>{pl.codigo} · Conservar copia firmada en el expediente del colaborador.</div>
        </footer>
      </div>
    </div>
  );
}
