"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { defaultTemplate, ALL_DEVICE_FIELDS } from "@/lib/domain/custody";

// Turns a textarea (one option per line) into a clean array.
function lines(v: FormDataEntryValue | null): string[] {
  return ((v as string) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Each "Title | text" line -> { titulo, texto } (for clauses and signatures).
function linePairs(
  v: FormDataEntryValue | null,
  claves: [string, string],
): Record<string, string>[] {
  return lines(v).map((l) => {
    const [a, ...resto] = l.split("|");
    return { [claves[0]]: a.trim(), [claves[1]]: resto.join("|").trim() };
  });
}

// Upserts a template override. The non-editable fields (name, folio prefix) come
// from the base content held in code.
export async function saveTemplate(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const clave = formData.get("clave") as string;
  const base = defaultTemplate(clave);

  const camposEquipo = formData
    .getAll("campos_equipo")
    .map(String)
    .filter((v) => (ALL_DEVICE_FIELDS as string[]).includes(v));

  const { error } = await sb.from("plantillas_responsiva").upsert({
    clave,
    nombre: base.nombre,
    prefijo_folio: base.prefijoFolio,
    codigo: ((formData.get("codigo") as string) ?? base.codigo).trim() || base.codigo,
    titulo: ((formData.get("titulo") as string) ?? base.titulo).trim() || base.titulo,
    version: ((formData.get("version") as string) ?? "1.0").trim() || "1.0",
    aviso: ((formData.get("aviso") as string) ?? "").trim() || null,
    iso: ((formData.get("iso") as string) ?? "").trim() || null,
    accesorios: lines(formData.get("accesorios")),
    seguridad: lines(formData.get("seguridad")),
    clausulas: linePairs(formData.get("clausulas"), ["titulo", "texto"]),
    firmas: linePairs(formData.get("firmas"), ["titulo", "nota"]),
    campos_equipo: camposEquipo,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[plantillas] guardar:", error.message);
    return;
  }

  revalidatePath("/ti/responsivas/plantillas");
  revalidatePath("/ti/responsivas");
}

// Restores a template to its base content (deletes the override).
export async function resetTemplate(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("plantillas_responsiva")
    .delete()
    .eq("clave", formData.get("clave") as string);
  if (error) {
    console.error("[plantillas] restablecer:", error.message);
    return;
  }
  revalidatePath("/ti/responsivas/plantillas");
  revalidatePath("/ti/responsivas");
}
