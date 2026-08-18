"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase/client";
import { lector } from "@/lib/utils/form";
import {
  MONEDAS,
  PERIODICIDADES,
  sumarMeses,
  type Moneda,
  type Periodicidad,
} from "@/lib/domain/facturas";

function refrescar() {
  revalidatePath("/ti/facturas/proveedores");
  revalidatePath("/ti/facturas");
  revalidatePath("/ti");
}

// Importe del form a número o null; acepta "1,234.50" (quita comas).
function montoDeForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function monedaValida(v: string | null): Moneda {
  return MONEDAS.includes(v as Moneda) ? (v as Moneda) : "MXN";
}

function periodicidadValida(v: string | null): Periodicidad {
  return PERIODICIDADES.some((p) => p.valor === v) ? (v as Periodicidad) : "mensual";
}

// Campos comunes de alta y edición, leídos del form.
function camposProveedor(formData: FormData) {
  const v = lector(formData);
  return {
    nombre: v("nombre"),
    servicio: v("servicio"),
    contacto: v("contacto"),
    telefono: v("telefono"),
    correo: v("correo"),
    costo: montoDeForm(v("costo")), // null = costo variable
    moneda: monedaValida(v("moneda")),
    periodicidad: periodicidadValida(v("periodicidad")),
    proximo_pago: v("proximo_pago"), // null = sin calendario
    notas: v("notas"),
  };
}

export async function crearProveedor(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { nombre, ...resto } = camposProveedor(formData);
  if (!nombre) return;
  const { error } = await sb.from("proveedores").insert({ nombre, ...resto });
  if (error) {
    console.error("[proveedores] crear:", error.message);
    return;
  }
  refrescar();
}

export async function editarProveedor(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const { nombre, ...resto } = camposProveedor(formData);
  if (!id || !nombre) return;
  const { error } = await sb
    .from("proveedores")
    .update({ nombre, ...resto })
    .eq("id", id);
  if (error) {
    console.error("[proveedores] editar:", error.message);
    return;
  }
  refrescar();
}

// Activa/desactiva sin borrar: un proveedor inactivo conserva su historial de
// facturas pero deja de proyectarse en el calendario.
export async function alternarActivo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { data: p } = await sb.from("proveedores").select("activo").eq("id", id).maybeSingle();
  if (!p) return;
  const { error } = await sb.from("proveedores").update({ activo: !p.activo }).eq("id", id);
  if (error) {
    console.error("[proveedores] alternar activo:", error.message);
    return;
  }
  refrescar();
}

export async function eliminarProveedor(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  // Las facturas del proveedor quedan (FK on delete set null).
  const { error } = await sb.from("proveedores").delete().eq("id", id);
  if (error) {
    console.error("[proveedores] eliminar:", error.message);
    return;
  }
  refrescar();
}

// La única "materialización" del calendario: crea la factura pendiente del
// periodo en curso (prellenada con los datos del proveedor) y avanza el ancla
// `proximo_pago` un periodo (pago único → se apaga el calendario).
export async function registrarPagoProveedor(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const { data: p } = await sb.from("proveedores").select("*").eq("id", id).maybeSingle();
  if (!p || !p.proximo_pago) return;

  const { error } = await sb.from("facturas").insert({
    proveedor_id: p.id,
    concepto: p.servicio ? `${p.nombre} · ${p.servicio}` : p.nombre,
    monto: p.costo === null ? 0 : Number(p.costo),
    moneda: p.moneda,
    fecha_vencimiento: p.proximo_pago,
    notas: "Generada desde el calendario de proveedores.",
  });
  if (error) {
    console.error("[proveedores] registrar pago:", error.message);
    return;
  }

  const paso = PERIODICIDADES.find((x) => x.valor === p.periodicidad)?.meses ?? 1;
  const siguiente = paso === 0 ? null : sumarMeses(p.proximo_pago, paso);
  const { error: errAncla } = await sb
    .from("proveedores")
    .update({ proximo_pago: siguiente })
    .eq("id", id);
  if (errAncla) console.error("[proveedores] avanzar ancla:", errAncla.message);
  refrescar();
}
