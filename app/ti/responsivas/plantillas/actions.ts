"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { plantillaDefault, CAMPOS_EQUIPO_TODOS } from "@/lib/responsivas";

// Convierte un textarea (una opción por línea) en arreglo limpio.
function lineas(v: FormDataEntryValue | null): string[] {
  return ((v as string) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Cada línea "Título | texto" -> { titulo, texto } (para cláusulas y firmas).
function paresLinea(
  v: FormDataEntryValue | null,
  claves: [string, string],
): Record<string, string>[] {
  return lineas(v).map((l) => {
    const [a, ...resto] = l.split("|");
    return { [claves[0]]: a.trim(), [claves[1]]: resto.join("|").trim() };
  });
}

// Guarda (upsert) el override de una plantilla. Los campos no editables
// (nombre, prefijo de folio) se toman del contenido base en código.
export async function guardarPlantilla(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const clave = formData.get("clave") as string;
  const base = plantillaDefault(clave);

  const camposEquipo = formData
    .getAll("campos_equipo")
    .map(String)
    .filter((v) => (CAMPOS_EQUIPO_TODOS as string[]).includes(v));

  const { error } = await sb.from("plantillas_responsiva").upsert({
    clave,
    nombre: base.nombre,
    prefijo_folio: base.prefijoFolio,
    codigo: ((formData.get("codigo") as string) ?? base.codigo).trim() || base.codigo,
    titulo: ((formData.get("titulo") as string) ?? base.titulo).trim() || base.titulo,
    version: ((formData.get("version") as string) ?? "1.0").trim() || "1.0",
    aviso: ((formData.get("aviso") as string) ?? "").trim() || null,
    iso: ((formData.get("iso") as string) ?? "").trim() || null,
    accesorios: lineas(formData.get("accesorios")),
    seguridad: lineas(formData.get("seguridad")),
    clausulas: paresLinea(formData.get("clausulas"), ["titulo", "texto"]),
    firmas: paresLinea(formData.get("firmas"), ["titulo", "nota"]),
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

// Restaura una plantilla a su contenido base (borra el override).
export async function restablecerPlantilla(formData: FormData) {
  const sb = await getSupabaseAutenticado();
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
