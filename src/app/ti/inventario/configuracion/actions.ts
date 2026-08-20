"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import {
  DEVICE_CATEGORIES,
  FIELD_TYPES,
  fieldSlug,
  type DeviceCategory,
  type FieldType,
} from "@/lib/domain/inventory";

// Turns a textarea (one option per line) into a clean array.
function lines(v: FormDataEntryValue | null): string[] {
  return ((v as string) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const VALORES_CAT = new Set<string>(DEVICE_CATEGORIES.map((c) => c.value));
const VALORES_TIPO = new Set<string>(FIELD_TYPES.map((t) => t.value));

function revalidate() {
  revalidatePath("/ti/inventario/configuracion");
  revalidatePath("/ti/inventario");
}

function validFieldType(raw: string | null): FieldType {
  return raw && VALORES_TIPO.has(raw) ? (raw as FieldType) : "texto";
}

export async function createField(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const categoria = (formData.get("categoria") as string) ?? "";
  if (!VALORES_CAT.has(categoria)) return;
  const label = ((formData.get("etiqueta") as string) ?? "").trim();
  if (!label) return;
  const tipo = validFieldType(formData.get("tipo") as string);

  // A stable key, unique within the category (the values in equipos.extras are
  // linked by this key, so it must not collide).
  const base = fieldSlug(label);
  const { data: existentes } = await sb
    .from("campos_inventario")
    .select("clave")
    .eq("categoria", categoria);
  const usadas = new Set((existentes ?? []).map((r) => r.clave as string));
  let clave = base;
  let i = 2;
  while (usadas.has(clave)) clave = `${base}_${i++}`;

  const { error } = await sb.from("campos_inventario").insert({
    categoria: categoria as DeviceCategory,
    clave,
    etiqueta: label.slice(0, 60),
    tipo,
    opciones: tipo === "opciones" ? lines(formData.get("opciones")) : [],
    placeholder: ((formData.get("placeholder") as string) ?? "").trim() || null,
    requerido: formData.get("requerido") === "on",
    orden: Number(formData.get("orden")) || 0,
    activo: true,
  });
  if (error) {
    console.error("[campos_inventario] crear:", error.message);
    return;
  }
  revalidate();
}

export async function editField(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const label = ((formData.get("etiqueta") as string) ?? "").trim();
  if (!label) return;
  const tipo = validFieldType(formData.get("tipo") as string);

  // The `clave` is not editable: it keeps the link to values already stored.
  const { error } = await sb
    .from("campos_inventario")
    .update({
      etiqueta: label.slice(0, 60),
      tipo,
      opciones: tipo === "opciones" ? lines(formData.get("opciones")) : [],
      placeholder: ((formData.get("placeholder") as string) ?? "").trim() || null,
      requerido: formData.get("requerido") === "on",
      orden: Number(formData.get("orden")) || 0,
      activo: formData.get("activo") === "on",
    })
    .eq("id", id);
  if (error) {
    console.error("[campos_inventario] editar:", error.message);
    return;
  }
  revalidate();
}

export async function deleteField(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("campos_inventario")
    .delete()
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[campos_inventario] eliminar:", error.message);
    return;
  }
  revalidate();
}
