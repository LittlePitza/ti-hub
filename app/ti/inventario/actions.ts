"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { categoriaInv, sanitizarAccesos } from "@/lib/inventario";
import { generarResponsiva, sincronizarResponsivasEquipo } from "@/app/ti/responsivas/actions";
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

  const correo = v("empleado")?.toLowerCase() ?? null;
  const { data: creado } = await sb.from("equipos").insert({
    nombre,
    categoria: cat.valor,
    tipo,
    marca: v("marca"),
    modelo: v("modelo"),
    num_serie: v("num_serie"),
    telefono,
    ...(await datosAsignacion(sb, correo)),
    ubicacion: v("ubicacion"),
    estado: v("estado") ?? "activo",
    fecha_compra: v("fecha_compra"),
    garantia_hasta: v("garantia_hasta"),
    notas: v("notas"),
    accesos: sanitizarAccesos(formData.get("accesos")),
  }).select("id").single();
  refrescar(cat.valor);

  // Si nace asignado, generamos su responsiva y vamos al aviso con enlace.
  if (correo && creado?.id) {
    const respId = await generarResponsiva(creado.id, correo);
    if (respId) redirect(`/ti/inventario?cat=${cat.valor}&resguardo=${respId}`);
  }
}

export async function cambiarEstadoEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  refrescar((formData.get("categoria") as string) ?? "computo");
}

// Edición completa del equipo (todos los campos de su categoría + asignación).
export async function editarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const id = formData.get("id") as string;
  if (!id) return;

  const cat = categoriaInv(v("categoria") ?? undefined);
  const tipo = cat.tipos.includes(v("tipo") ?? "") ? v("tipo") : cat.tipos[0];
  const telefono = v("telefono");
  const nombre = v("nombre") ?? (telefono ? `Línea ${telefono}` : null);
  if (!nombre) return;

  await sb.from("equipos").update({
    nombre,
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
    accesos: sanitizarAccesos(formData.get("accesos")),
  }).eq("id", id);
  refrescar(cat.valor);

  // Refresca el snapshot de las responsivas no firmadas de este equipo.
  await sincronizarResponsivasEquipo(sb, id);
}

// Asignar a un empleado o liberar (correo vacío => libre).
export async function asignarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cat = (formData.get("categoria") as string) ?? "computo";
  const correo = ((formData.get("empleado") as string) ?? "").trim().toLowerCase() || null;
  await sb.from("equipos").update(await datosAsignacion(sb, correo)).eq("id", id);
  refrescar(cat);

  // Al asignar a un empleado se genera (o reutiliza) su responsiva y se
  // redirige con un aviso que enlaza al documento. Liberar no genera nada.
  if (correo) {
    const respId = await generarResponsiva(id, correo);
    if (respId) redirect(`/ti/inventario?cat=${cat}&resguardo=${respId}`);
  }
}

export async function eliminarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("equipos").delete().eq("id", formData.get("id") as string);
  refrescar((formData.get("categoria") as string) ?? "computo");
}
