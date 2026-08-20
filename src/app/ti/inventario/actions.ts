"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import {
  deviceCategory,
  sanitizeCredentials,
  sanitizeCustomFields,
  fieldFromRow,
  type CustomField,
} from "@/lib/domain/inventory";
import { createCustodyLetter, syncDeviceCustodyLetters } from "@/app/ti/responsivas/actions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJsonb } from "@/lib/utils/jsonb";

function revalidate(cat: string) {
  revalidatePath(`/ti/inventario`);
  revalidatePath(`/ti/empleados`);
  revalidatePath(`/ti`);
  return cat;
}

// Active custom-field definitions for a category (used to sanitise the extras).
async function categoryFieldDefs(sb: SupabaseClient, categoria: string): Promise<CustomField[]> {
  const { data } = await sb
    .from("campos_inventario")
    .select("*")
    .eq("categoria", categoria)
    .eq("activo", true);
  return (data ?? []).map(fieldFromRow);
}

// The assignment select sends the employee email; the name is looked up in
// `empleados` and stored denormalised (for display) alongside the email (the link).
async function assignmentData(sb: SupabaseClient, correo: string | null) {
  if (!correo) return { asignado_a: null, asignado_email: null };
  const { data } = await sb.from("empleados").select("nombre").eq("correo", correo).maybeSingle();
  return { asignado_a: data?.nombre ?? correo, asignado_email: correo };
}

// The create result for useActionState: the card reads it to close on success or
// show the reason on failure (same shape as createTicket in tickets).
export type EstadoCrearEquipo = { ok: true } | { ok: false; error: string } | null;

export async function createDevice(
  _prev: EstadoCrearEquipo,
  formData: FormData,
): Promise<EstadoCrearEquipo> {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  const v = reader(formData);

  const cat = deviceCategory(v("categoria") ?? undefined);
  const tipoRaw = v("tipo");
  const tipo = tipoRaw && cat.tipos.includes(tipoRaw) ? tipoRaw : cat.tipos[0];
  const telefono = v("telefono");
  // Phone lines may carry no label: the number acts as the name.
  const nombre = v("nombre") ?? (telefono ? `Línea ${telefono}` : null);
  if (!nombre) {
    return {
      ok: false,
      error:
        cat.value === "linea"
          ? "Escribe el número de la línea."
          : `Escribe un nombre o etiqueta para ${cat.singular === "equipo" ? "el equipo" : "la " + cat.singular}.`,
    };
  }

  const correo = v("empleado")?.toLowerCase() ?? null;
  const { data: creado, error } = await sb
    .from("equipos")
    .insert({
      nombre,
      categoria: cat.value,
      tipo,
      marca: v("marca"),
      modelo: v("modelo"),
      num_serie: v("num_serie"),
      telefono,
      ...(await assignmentData(sb, correo)),
      ubicacion: v("ubicacion"),
      estado: v("estado") ?? "activo",
      fecha_compra: v("fecha_compra"),
      garantia_hasta: v("garantia_hasta"),
      notas: v("notas"),
      accesos: toJsonb(sanitizeCredentials(formData.get("accesos"))),
      extras: toJsonb(
        sanitizeCustomFields(await categoryFieldDefs(sb, cat.value), formData.get("extras")),
      ),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  revalidate(cat.value);

  // If it is created already assigned, generate its custody letter and go to the
  // notice with a link (the redirect navigates and unmounts the card).
  if (correo && creado?.id) {
    const respId = await createCustodyLetter(creado.id, correo);
    if (respId) redirect(`/ti/inventario?cat=${cat.value}&resguardo=${respId}`);
  }
  return { ok: true };
}

export async function changeDeviceStatus(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("equipos")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[inventario] cambiar estado:", error.message);
    return;
  }
  revalidate((formData.get("categoria") as string) ?? "computo");
}

// Full device edit (every field of its category, plus the assignment).
export async function editDevice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const v = reader(formData);
  const id = formData.get("id") as string;
  if (!id) return;

  const cat = deviceCategory(v("categoria") ?? undefined);
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
      ...(await assignmentData(sb, v("empleado")?.toLowerCase() ?? null)),
      ubicacion: v("ubicacion"),
      estado: v("estado") ?? "activo",
      fecha_compra: v("fecha_compra"),
      garantia_hasta: v("garantia_hasta"),
      notas: v("notas"),
      accesos: toJsonb(sanitizeCredentials(formData.get("accesos"))),
      extras: toJsonb(
        sanitizeCustomFields(await categoryFieldDefs(sb, cat.value), formData.get("extras")),
      ),
    })
    .eq("id", id);
  if (error) {
    console.error("[inventario] editar:", error.message);
    return;
  }
  revalidate(cat.value);

  // Refreshes the snapshot of this device's unsigned custody letters.
  await syncDeviceCustodyLetters(sb, id);
}

// Assign to an employee, or release (an empty email => free).
export async function assignDevice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const cat = (formData.get("categoria") as string) ?? "computo";
  const correo = ((formData.get("empleado") as string) ?? "").trim().toLowerCase() || null;
  const { error } = await sb
    .from("equipos")
    .update(await assignmentData(sb, correo))
    .eq("id", id);
  if (error) {
    console.error("[inventario] asignar:", error.message);
    return;
  }
  revalidate(cat);

  // Assigning to an employee creates (or reuses) their custody letter and
  // redirects with a notice linking to the document. Releasing creates nothing.
  if (correo) {
    const respId = await createCustodyLetter(id, correo);
    if (respId) redirect(`/ti/inventario?cat=${cat}&resguardo=${respId}`);
  }
}

export async function deleteDevice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("equipos")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[inventario] eliminar:", error.message);
    return;
  }
  revalidate((formData.get("categoria") as string) ?? "computo");
}
