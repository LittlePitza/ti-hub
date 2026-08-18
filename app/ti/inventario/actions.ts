"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";
import {
  categoriaInv,
  sanitizarAccesos,
  sanitizarExtras,
  campoDeFila,
  type CampoInv,
} from "@/lib/inventario";
import { generarResponsiva, sincronizarResponsivasEquipo } from "@/app/ti/responsivas/actions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJsonb } from "@/lib/jsonb";

function refrescar(cat: string) {
  revalidatePath(`/ti/inventario`);
  revalidatePath(`/ti/empleados`);
  revalidatePath(`/ti`);
  return cat;
}

// Definiciones activas de campos personalizados de una categoría (para sanear extras).
async function defsCategoria(sb: SupabaseClient, categoria: string): Promise<CampoInv[]> {
  const { data } = await sb
    .from("campos_inventario")
    .select("*")
    .eq("categoria", categoria)
    .eq("activo", true);
  return (data ?? []).map(campoDeFila);
}

// El select de asignación manda el correo del empleado; el nombre se busca
// en `empleados` para guardarlo desnormalizado (display) junto al correo (vínculo).
async function datosAsignacion(sb: SupabaseClient, correo: string | null) {
  if (!correo) return { asignado_a: null, asignado_email: null };
  const { data } = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  return { asignado_a: data?.nombre ?? correo, asignado_email: correo };
}

// Resultado del alta para useActionState: la tarjeta lo lee para cerrar al éxito
// o mostrar el motivo si algo falla (misma forma que crearTicket en tickets).
export type EstadoCrearEquipo = { ok: true } | { ok: false; error: string } | null;

export async function crearEquipo(
  _prev: EstadoCrearEquipo,
  formData: FormData,
): Promise<EstadoCrearEquipo> {
  const sb = await getSupabaseAutenticado();
  if (!sb) return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  const v = lector(formData);

  const cat = categoriaInv(v("categoria") ?? undefined);
  const tipoRaw = v("tipo");
  const tipo = tipoRaw && cat.tipos.includes(tipoRaw) ? tipoRaw : cat.tipos[0];
  const telefono = v("telefono");
  // Las líneas pueden no llevar etiqueta: el número hace de nombre.
  const nombre = v("nombre") ?? (telefono ? `Línea ${telefono}` : null);
  if (!nombre) {
    return {
      ok: false,
      error:
        cat.valor === "linea"
          ? "Escribe el número de la línea."
          : `Escribe un nombre o etiqueta para ${cat.singular === "equipo" ? "el equipo" : "la " + cat.singular}.`,
    };
  }

  const correo = v("empleado")?.toLowerCase() ?? null;
  const { data: creado, error } = await sb
    .from("equipos")
    .insert({
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
      accesos: toJsonb(sanitizarAccesos(formData.get("accesos"))),
      extras: toJsonb(sanitizarExtras(await defsCategoria(sb, cat.valor), formData.get("extras"))),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  refrescar(cat.valor);

  // Si nace asignado, generamos su responsiva y vamos al aviso con enlace
  // (el redirect navega y desmonta la tarjeta).
  if (correo && creado?.id) {
    const respId = await generarResponsiva(creado.id, correo);
    if (respId) redirect(`/ti/inventario?cat=${cat.valor}&resguardo=${respId}`);
  }
  return { ok: true };
}

export async function cambiarEstadoEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { error } = await sb
    .from("equipos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[inventario] cambiar estado:", error.message);
    return;
  }
  refrescar((formData.get("categoria") as string) ?? "computo");
}

// Edición completa del equipo (todos los campos de su categoría + asignación).
export async function editarEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  if (!id) return;

  const cat = categoriaInv(v("categoria") ?? undefined);
  const tipoRaw = v("tipo");
  const tipo = tipoRaw && cat.tipos.includes(tipoRaw) ? tipoRaw : cat.tipos[0];
  const telefono = v("telefono");
  const nombre = v("nombre") ?? (telefono ? `Línea ${telefono}` : null);
  if (!nombre) return;

  const { error } = await sb
    .from("equipos")
    .update({
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
      accesos: toJsonb(sanitizarAccesos(formData.get("accesos"))),
      extras: toJsonb(sanitizarExtras(await defsCategoria(sb, cat.valor), formData.get("extras"))),
    })
    .eq("id", id);
  if (error) {
    console.error("[inventario] editar:", error.message);
    return;
  }
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
  const { error } = await sb
    .from("equipos")
    .update(await datosAsignacion(sb, correo))
    .eq("id", id);
  if (error) {
    console.error("[inventario] asignar:", error.message);
    return;
  }
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
  const { error } = await sb
    .from("equipos")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[inventario] eliminar:", error.message);
    return;
  }
  refrescar((formData.get("categoria") as string) ?? "computo");
}
