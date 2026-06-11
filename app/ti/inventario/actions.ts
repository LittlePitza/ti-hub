"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { categoriaInv } from "@/lib/inventario";
import type { SupabaseClient } from "@supabase/supabase-js";

function refrescar(cat: string) {
  revalidatePath(`/ti/inventario`);
  revalidatePath(`/ti/empleados`);
  revalidatePath(`/ti`);
  return cat;
}

// El select de asignación manda el correo del empleado; el nombre se busca
// en `empleados` para guardarlo desnormalizado (display) junto al correo (vínculo).
async function datosAsignacion(sb: SupabaseClient, correo: string | null) {
  if (!correo) return { asignado_a: null, asignado_email: null };
  const { data } = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  return { asignado_a: data?.nombre ?? correo, asignado_email: correo };
}

export async function crearEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;

  const cat = categoriaInv(v("categoria") ?? undefined);
  const tipo = cat.tipos.includes(v("tipo") ?? "") ? v("tipo") : cat.tipos[0];
  const telefono = v("telefono");
  // Las líneas pueden no llevar etiqueta: el número hace de nombre.
  const nombre = v("nombre") ?? (telefono ? `Línea ${telefono}` : null);
  if (!nombre) return;

  await sb.from("equipos").insert({
    nombre,
    categoria: cat.valor,
    tipo,
    marca: v("marca"),
    modelo: v("modelo"),
    num_serie: v("num_serie"),
    telefono,
    ...(await datosAsignacion(sb, v("empleado")?.toLowerCase() ?? null)),
    ubicacion: v("ubicacion"),
    estado: v("estado") ?? "activo",
    fecha_compra: v("fecha_compra"),
    garantia_hasta: v("garantia_hasta"),
    notas: v("notas"),
  });
  refrescar(cat.valor);
}

export async function cambiarEstadoEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  refrescar((formData.get("categoria") as string) ?? "computo");
}

// Asignar a un empleado o liberar (correo vacío => libre).
export async function asignarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const correo = ((formData.get("empleado") as string) ?? "").trim().toLowerCase() || null;
  await sb.from("equipos")
    .update(await datosAsignacion(sb, correo))
    .eq("id", formData.get("id") as string);
  refrescar((formData.get("categoria") as string) ?? "computo");
}

export async function eliminarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos").delete().eq("id", formData.get("id") as string);
  refrescar((formData.get("categoria") as string) ?? "computo");
}
