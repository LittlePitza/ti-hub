"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import {
  plantillaDeEquipo,
  snapshotEquipo,
  sanitizarPersonas,
  type DatosResponsiva,
} from "@/lib/responsivas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TablesUpdate } from "@/types/database";
import { jsonbObject, toJsonb } from "@/lib/jsonb";

function refrescar(id?: string) {
  revalidatePath("/ti/responsivas");
  revalidatePath("/ti/inventario");
  revalidatePath("/ti");
  if (id) revalidatePath(`/ti/responsivas/${id}`);
}

// Genera (o reutiliza) la responsiva de un equipo asignado a un empleado.
// Se llama desde el módulo y desde inventario al asignar. Congela un snapshot
// de los datos del empleado y del equipo: el documento no cambia si luego
// cambian esos datos. Devuelve el id de la responsiva (nueva o existente).
export async function generarResponsiva(equipoId: string, correo: string): Promise<string | null> {
  const sb = await getSupabaseAutenticado();
  if (!sb || !equipoId || !correo) return null;

  const { data: eq } = await sb.from("equipos").select("*").eq("id", equipoId).maybeSingle();
  if (!eq) return null;

  // No duplicar: si ya hay una responsiva abierta de este equipo para este
  // empleado (borrador/pendiente/firmada), se reutiliza.
  const { data: abiertas } = await sb
    .from("responsivas")
    .select("id")
    .eq("equipo_id", equipoId)
    .eq("empleado_correo", correo)
    .in("estado", ["borrador", "pendiente_firma", "firmada"])
    .limit(1);
  if (abiertas && abiertas.length) return abiertas[0].id;

  const { data: emp } = await sb
    .from("empleados")
    .select("nombre, puesto, departamento")
    .eq("correo", correo)
    .maybeSingle();

  const datos: DatosResponsiva = {
    equipo: snapshotEquipo(eq),
    accesorios: [],
    seguridad: [],
    observaciones: "",
    estado_fisico: "Usado — buen estado",
  };

  const { data: nueva, error } = await sb
    .from("responsivas")
    .insert({
      equipo_id: equipoId,
      plantilla: plantillaDeEquipo(eq.categoria ?? "computo", eq.tipo ?? "laptop"),
      empleado_correo: correo,
      empleado_nombre: emp?.nombre ?? eq.asignado_a ?? correo,
      empleado_puesto: emp?.puesto ?? null,
      empleado_departamento: emp?.departamento ?? null,
      equipo_nombre: eq.nombre,
      datos: toJsonb(datos),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[responsivas] generar:", error.message);
    return null;
  }

  refrescar(nueva?.id);
  return nueva?.id ?? null;
}

// Botón "Generar responsiva" desde inventario (equipo ya asignado).
export async function generarResponsivaEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const equipoId = formData.get("equipo_id") as string;
  const { data: eq } = await sb
    .from("equipos")
    .select("asignado_email")
    .eq("id", equipoId)
    .maybeSingle();
  if (!eq?.asignado_email) return;
  const id = await generarResponsiva(equipoId, eq.asignado_email);
  if (id) redirect(`/ti/responsivas/${id}`);
}

// Edita los datos del documento (accesorios, seguridad, observaciones, notas).
export async function editarResponsiva(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;

  const { data: r } = await sb.from("responsivas").select("datos").eq("id", id).single();
  const datos = {
    ...jsonbObject<DatosResponsiva>(r?.datos, {} as DatosResponsiva),
    accesorios: formData.getAll("accesorios").map(String),
    seguridad: formData.getAll("seguridad").map(String),
    observaciones: ((formData.get("observaciones") as string) ?? "").trim(),
    estado_fisico: (formData.get("estado_fisico") as string) ?? "",
  };
  const notas = ((formData.get("notas") as string) ?? "").trim() || null;
  const fechaEntrega = ((formData.get("fecha_entrega") as string) ?? "").trim() || null;
  const personas = sanitizarPersonas(formData.get("personas"));

  const { error } = await sb
    .from("responsivas")
    .update({ datos, notas, fecha_entrega: fechaEntrega, personas })
    .eq("id", id);
  if (error) {
    console.error("[responsivas] editar:", error.message);
    return;
  }
  refrescar(id);
}

// Re-lee el equipo del inventario y refresca el snapshot (`datos.equipo` +
// `equipo_nombre`) de las responsivas NO firmadas (borrador/pendiente_firma)
// ligadas a él. Conserva accesorios/seguridad/observaciones/estado_fisico.
// Lo invoca inventario al editar un equipo; las firmadas no se tocan (integridad
// legal: solo se refrescan a mano con `actualizarDesdeInventario`).
export async function sincronizarResponsivasEquipo(sb: SupabaseClient, equipoId: string) {
  if (!equipoId) return;
  const { data: eq } = await sb.from("equipos").select("*").eq("id", equipoId).maybeSingle();
  if (!eq) return;

  const { data: resps } = await sb
    .from("responsivas")
    .select("id, datos")
    .eq("equipo_id", equipoId)
    .in("estado", ["borrador", "pendiente_firma"]);
  if (!resps?.length) return;

  const equipo = snapshotEquipo(eq);
  for (const r of resps) {
    const datos = { ...(r.datos ?? {}), equipo };
    const { error } = await sb
      .from("responsivas")
      .update({ datos, equipo_nombre: eq.nombre })
      .eq("id", r.id);
    if (error) {
      console.error("[responsivas] sincronizar snapshot:", error.message);
      continue;
    }
    refrescar(r.id);
  }
}

// Botón "Actualizar desde inventario" en la responsiva: re-lee el equipo
// vinculado y refresca su snapshot, sin importar el estado. Si el equipo ya no
// existe (equipo_id nulo), no hace nada.
export async function actualizarDesdeInventario(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const { data: r } = await sb
    .from("responsivas")
    .select("equipo_id, datos")
    .eq("id", id)
    .maybeSingle();
  if (!r?.equipo_id) return;

  const { data: eq } = await sb.from("equipos").select("*").eq("id", r.equipo_id).maybeSingle();
  if (!eq) return;

  const datos = {
    ...jsonbObject<DatosResponsiva>(r.datos, {} as DatosResponsiva),
    equipo: snapshotEquipo(eq),
  };
  const { error } = await sb
    .from("responsivas")
    .update({ datos, equipo_nombre: eq.nombre })
    .eq("id", id);
  if (error) {
    console.error("[responsivas] actualizar desde inventario:", error.message);
    return;
  }
  refrescar(id);
}

// Sube el escaneo/PDF firmado al bucket de Storage y marca la responsiva firmada.
export async function subirFirmada(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const file = formData.get("archivo") as File | null;
  if (!file || file.size === 0) return;

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "pdf";
  const path = `${id}/firmada-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage
    .from("responsivas")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) {
    console.error("[responsivas] subir firmada (storage):", error.message);
    return;
  }

  const { error: errFila } = await sb
    .from("responsivas")
    .update({
      archivo_url: path,
      archivo_nombre: file.name,
      estado: "firmada",
      fecha_firmada: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (errFila) {
    console.error("[responsivas] subir firmada:", errFila.message);
    return;
  }
  refrescar(id);
}

export async function cambiarEstadoResponsiva(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;
  const update: TablesUpdate<"responsivas"> = { estado };
  if (estado === "firmada") update.fecha_firmada = new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("responsivas").update(update).eq("id", id);
  if (error) {
    console.error("[responsivas] cambiar estado:", error.message);
    return;
  }
  refrescar(id);
}

export async function eliminarResponsiva(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const archivo = formData.get("archivo_url") as string | null;
  if (archivo) await sb.storage.from("responsivas").remove([archivo]);
  const { error } = await sb.from("responsivas").delete().eq("id", id);
  if (error) {
    console.error("[responsivas] eliminar:", error.message);
    return;
  }
  refrescar();
}
