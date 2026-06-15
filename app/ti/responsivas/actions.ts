"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { plantillaDeEquipo, type DatosResponsiva } from "@/lib/responsivas";

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
    equipo: {
      categoria: eq.categoria ?? "computo",
      tipo: eq.tipo ?? "laptop",
      marca: eq.marca ?? null,
      modelo: eq.modelo ?? null,
      num_serie: eq.num_serie ?? null,
      telefono: eq.telefono ?? null,
      ubicacion: eq.ubicacion ?? null,
      fecha_compra: eq.fecha_compra ?? null,
      garantia_hasta: eq.garantia_hasta ?? null,
    },
    accesorios: [],
    seguridad: [],
    observaciones: "",
    estado_fisico: "Usado — buen estado",
  };

  const { data: nueva } = await sb
    .from("responsivas")
    .insert({
      equipo_id: equipoId,
      plantilla: plantillaDeEquipo(eq.categoria ?? "computo", eq.tipo ?? "laptop"),
      empleado_correo: correo,
      empleado_nombre: emp?.nombre ?? eq.asignado_a ?? correo,
      empleado_puesto: emp?.puesto ?? null,
      empleado_departamento: emp?.departamento ?? null,
      equipo_nombre: eq.nombre,
      datos,
    })
    .select("id")
    .single();

  refrescar(nueva?.id);
  return nueva?.id ?? null;
}

// Botón "Generar responsiva" desde inventario (equipo ya asignado).
export async function generarResponsivaEquipo(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const equipoId = formData.get("equipo_id") as string;
  const { data: eq } = await sb.from("equipos").select("asignado_email").eq("id", equipoId).maybeSingle();
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
    ...(r?.datos ?? {}),
    accesorios: formData.getAll("accesorios").map(String),
    seguridad: formData.getAll("seguridad").map(String),
    observaciones: ((formData.get("observaciones") as string) ?? "").trim(),
    estado_fisico: (formData.get("estado_fisico") as string) ?? "",
  };
  const notas = ((formData.get("notas") as string) ?? "").trim() || null;

  await sb.from("responsivas").update({ datos, notas }).eq("id", id);
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
  if (error) return;

  await sb
    .from("responsivas")
    .update({
      archivo_url: path,
      archivo_nombre: file.name,
      estado: "firmada",
      fecha_firmada: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  refrescar(id);
}

export async function cambiarEstadoResponsiva(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as string;
  const update: Record<string, unknown> = { estado };
  if (estado === "firmada") update.fecha_firmada = new Date().toISOString().slice(0, 10);
  await sb.from("responsivas").update(update).eq("id", id);
  refrescar(id);
}

export async function eliminarResponsiva(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const archivo = formData.get("archivo_url") as string | null;
  if (archivo) await sb.storage.from("responsivas").remove([archivo]);
  await sb.from("responsivas").delete().eq("id", id);
  refrescar();
}
