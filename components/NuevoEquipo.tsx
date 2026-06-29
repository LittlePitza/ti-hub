"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { CATEGORIAS_INV, categoriaInv, type CategoriaInv, type CampoInv } from "@/lib/inventario";
import { crearEquipo, type EstadoCrearEquipo } from "@/app/ti/inventario/actions";
import BotonEnviar from "@/components/BotonEnviar";
import AccesosEquipo from "@/components/AccesosEquipo";
import CamposExtra from "@/components/CamposExtra";

// "Registrar equipo" abre una tarjeta modal (mismo <dialog> nativo y estilo que
// ModalCrearTicket) con el alta del inventario. Arriba, un control segmentado por
// categoría: ahí se elige Cómputo / Celulares y tablets / Líneas / Software, así
// que una tablet es descubrible sin salir de la tarjeta. Los campos se adaptan a la
// categoría seleccionada (lib/inventario.ts) y se reinician al cambiarla (key).
// useActionState da el resultado del alta: al guardar con éxito el modal se cierra.

type Empleado = { nombre: string; correo: string };

// Iconos estáticos, hoisteados fuera del render.
const ICONO_MAS = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Glifo por categoría para el control segmentado (laptop / teléfono / línea / licencia).
const GLIFO_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const GLIFO: Record<CategoriaInv, ReactNode> = {
  computo: (
    <svg {...GLIFO_PROPS}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M2 20h20" /></svg>
  ),
  celular: (
    <svg {...GLIFO_PROPS}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
  ),
  linea: (
    <svg {...GLIFO_PROPS}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
  ),
  software: (
    <svg {...GLIFO_PROPS}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10l-2 2 2 2M16 10l2 2-2 2M13 8l-2 8" /></svg>
  ),
};

const ESTADOS: { valor: string; label: string }[] = [
  { valor: "activo", label: "Activo" },
  { valor: "en_reparacion", label: "En reparación" },
  { valor: "almacen", label: "Almacén" },
  { valor: "baja", label: "Baja" },
];

// Etiquetas legibles para el <select> de Tipo (la columna `tipo` guarda la clave).
const TIPO_LABEL: Record<string, string> = {
  laptop: "Laptop",
  desktop: "PC de escritorio",
  monitor: "Monitor",
  impresora: "Impresora",
  red: "Equipo de red",
  servidor: "Servidor",
  perifericos: "Periféricos",
  otro: "Otro",
  celular: "Celular",
  tablet: "Tablet",
  linea: "Línea",
  software: "Software",
};

// Campos del alta según la categoría. A nivel de módulo (no anidado) y con `key`
// por categoría en el padre para que los inputs no controlados se reinicien al
// cambiar de segmento.
function CamposEquipo({
  cat,
  empleados,
}: {
  cat: (typeof CATEGORIAS_INV)[number];
  empleados: Empleado[];
}) {
  const c = cat.campos;
  return (
    <div className="campos">
      <div className="campo">
        <label htmlFor="eq-nombre">{c.nombre.label}</label>
        <input id="eq-nombre" name="nombre" placeholder={c.nombre.placeholder} required={cat.valor !== "linea"} />
      </div>
      {cat.tipos.length > 1 ? (
        <div className="campo">
          <label htmlFor="eq-tipo">Tipo</label>
          <select id="eq-tipo" name="tipo" defaultValue={cat.tipos[0]}>
            {cat.tipos.map((t) => <option key={t} value={t}>{TIPO_LABEL[t] ?? t}</option>)}
          </select>
        </div>
      ) : null}
      {c.marca ? (
        <div className="campo">
          <label htmlFor="eq-marca">{c.marca.label}</label>
          <input id="eq-marca" name="marca" placeholder={c.marca.placeholder} />
        </div>
      ) : null}
      {c.modelo ? (
        <div className="campo">
          <label htmlFor="eq-modelo">{c.modelo.label}</label>
          <input id="eq-modelo" name="modelo" placeholder={c.modelo.placeholder} />
        </div>
      ) : null}
      {c.num_serie ? (
        <div className="campo">
          <label htmlFor="eq-serie">{c.num_serie.label}</label>
          <input id="eq-serie" name="num_serie" placeholder={c.num_serie.placeholder} />
        </div>
      ) : null}
      {c.telefono ? (
        <div className="campo">
          <label htmlFor="eq-telefono">{c.telefono.label}</label>
          <input id="eq-telefono" name="telefono" placeholder={c.telefono.placeholder} required={cat.valor === "linea"} />
        </div>
      ) : null}
      <div className="campo">
        <label htmlFor="eq-empleado">Asignar a</label>
        <select id="eq-empleado" name="empleado" defaultValue="">
          <option value="">— Libre / sin asignar —</option>
          {empleados.map((p) => <option key={p.correo} value={p.correo}>{p.nombre}</option>)}
        </select>
      </div>
      {c.ubicacion ? (
        <div className="campo">
          <label htmlFor="eq-ubicacion">Ubicación</label>
          <input id="eq-ubicacion" name="ubicacion" placeholder="Planta · Oficina" />
        </div>
      ) : null}
      <div className="campo">
        <label htmlFor="eq-estado">Estado</label>
        <select id="eq-estado" name="estado" defaultValue="activo">
          {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
        </select>
      </div>
      {c.fechas ? (
        <>
          <div className="campo">
            <label htmlFor="eq-compra">Fecha de compra</label>
            <input id="eq-compra" name="fecha_compra" type="date" />
          </div>
          <div className="campo">
            <label htmlFor="eq-garantia">{c.garantiaLabel}</label>
            <input id="eq-garantia" name="garantia_hasta" type="date" />
          </div>
        </>
      ) : null}
      <div className="campo ancho">
        <label htmlFor="eq-notas">Notas</label>
        <textarea id="eq-notas" name="notas" placeholder="Detalles, accesorios incluidos, historial…" />
      </div>
    </div>
  );
}

export default function NuevoEquipo({
  empleados,
  categoriaInicial,
  camposPorCategoria,
}: {
  empleados: Empleado[];
  categoriaInicial: CategoriaInv;
  camposPorCategoria: Record<string, CampoInv[]>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, accion] = useActionState<EstadoCrearEquipo, FormData>(crearEquipo, null);
  const [categoria, setCategoria] = useState<CategoriaInv>(categoriaInicial);
  const cat = categoriaInv(categoria);

  const abrir = () => {
    setCategoria(categoriaInicial); // arranca en la categoría de la pestaña actual
    ref.current?.showModal();
  };

  // Al guardar con éxito (sin redirect por asignación): limpiar y cerrar.
  useEffect(() => {
    if (estado?.ok) {
      formRef.current?.reset();
      setCategoria(categoriaInicial);
      ref.current?.close();
    }
  }, [estado, categoriaInicial]);

  return (
    <>
      <button type="button" className="boton" onClick={abrir}>
        {ICONO_MAS} Registrar equipo
      </button>

      <dialog
        ref={ref}
        className="modal-gestionar modal-crear modal-nuevo-equipo"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="modal-gestionar-card">
          <header className="modal-gestionar-head">
            <div className="modal-gestionar-titulo">
              <h3>Registrar equipo</h3>
              <span className="suave">Alta de {cat.singular} en el inventario</span>
            </div>
            <button
              type="button"
              className="modal-gestionar-x"
              aria-label="Cerrar"
              onClick={() => ref.current?.close()}
            >
              ✕
            </button>
          </header>

          <div className="modal-gestionar-body">
            <div className="seg-categoria" role="radiogroup" aria-label="Tipo de activo">
              {CATEGORIAS_INV.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  role="radio"
                  aria-checked={t.valor === categoria}
                  className={`seg-cat ${t.valor === categoria ? "activo" : ""}`}
                  onClick={() => setCategoria(t.valor)}
                >
                  <span className="seg-cat-glifo">{GLIFO[t.valor]}</span>
                  <span className="seg-cat-label">{t.etiqueta}</span>
                </button>
              ))}
            </div>

            <form ref={formRef} action={accion} className="formulario plano">
              <input type="hidden" name="categoria" value={categoria} />
              <CamposEquipo key={categoria} cat={cat} empleados={empleados} />
              <AccesosEquipo />
              <CamposExtra key={`extra-${categoria}`} definiciones={camposPorCategoria[categoria] ?? []} />
              <p className="alta-nota suave">Si lo asignas a un empleado, se generará su responsiva en automático.</p>
              {estado?.ok === false ? <p className="combo-error">{estado.error}</p> : null}
              <BotonEnviar className="boton" ocupado="Guardando…">Guardar {cat.singular}</BotonEnviar>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
