"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { CATEGORIAS_INV, TIPOS_CAMPO, slugCampo, type CategoriaInv, type TipoCampo } from "@/lib/inventario";

// Convierte un textarea (una opción por línea) en arreglo limpio.
function lineas(v: FormDataEntryValue | null): string[] {
  return ((v as string) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const VALORES_CAT = new Set<string>(CATEGORIAS_INV.map((c) => c.valor));
const VALORES_TIPO = new Set<string>(TIPOS_CAMPO.map((t) => t.valor));

function refrescar() {
  revalidatePath("/ti/inventario/configuracion");
  revalidatePath("/ti/inventario");
}

function tipoValido(raw: string | null): TipoCampo {
  return raw && VALORES_TIPO.has(raw) ? (raw as TipoCampo) : "texto";
}

export async function crearCampo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const categoria = (formData.get("categoria") as string) ?? "";
  if (!VALORES_CAT.has(categoria)) return;
  const etiqueta = ((formData.get("etiqueta") as string) ?? "").trim();
  if (!etiqueta) return;
  const tipo = tipoValido(formData.get("tipo") as string);

  // Clave estable y única dentro de la categoría (los valores en equipos.extras
  // se vinculan por esta clave, así que no debe colisionar).
  const base = slugCampo(etiqueta);
  const { data: existentes } = await sb
    .from("campos_inventario")
    .select("clave")
    .eq("categoria", categoria);
  const usadas = new Set((existentes ?? []).map((r) => r.clave as string));
  let clave = base;
  let i = 2;
  while (usadas.has(clave)) clave = `${base}_${i++}`;

  await sb.from("campos_inventario").insert({
    categoria: categoria as CategoriaInv,
    clave,
    etiqueta: etiqueta.slice(0, 60),
    tipo,
    opciones: tipo === "opciones" ? lineas(formData.get("opciones")) : [],
    placeholder: ((formData.get("placeholder") as string) ?? "").trim() || null,
    requerido: formData.get("requerido") === "on",
    orden: Number(formData.get("orden")) || 0,
    activo: true,
  });
  refrescar();
}

export async function editarCampo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const etiqueta = ((formData.get("etiqueta") as string) ?? "").trim();
  if (!etiqueta) return;
  const tipo = tipoValido(formData.get("tipo") as string);

  // La `clave` no se edita: mantiene el vínculo con los valores ya guardados.
  await sb
    .from("campos_inventario")
    .update({
      etiqueta: etiqueta.slice(0, 60),
      tipo,
      opciones: tipo === "opciones" ? lineas(formData.get("opciones")) : [],
      placeholder: ((formData.get("placeholder") as string) ?? "").trim() || null,
      requerido: formData.get("requerido") === "on",
      orden: Number(formData.get("orden")) || 0,
      activo: formData.get("activo") === "on",
    })
    .eq("id", id);
  refrescar();
}

export async function eliminarCampo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("campos_inventario").delete().eq("id", formData.get("id") as string);
  refrescar();
}
