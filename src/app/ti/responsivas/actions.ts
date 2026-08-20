"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import {
  templateForDevice,
  deviceSnapshot,
  sanitizeParties,
  type CustodySnapshot,
} from "@/lib/domain/custody";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TablesUpdate } from "@/types/database";
import { jsonbObject, toJsonb } from "@/lib/utils/jsonb";

function revalidate(id?: string) {
  revalidatePath("/ti/responsivas");
  revalidatePath("/ti/inventario");
  revalidatePath("/ti");
  if (id) revalidatePath(`/ti/responsivas/${id}`);
}

// Creates (or reuses) the custody letter for a device assigned to an employee.
// Called both from this module and from inventory on assignment. It freezes a
// snapshot of the employee and device data, so the document does not change if
// those records are edited later. Returns the letter id (new or existing).
export async function createCustodyLetter(
  equipoId: string,
  correo: string,
): Promise<string | null> {
  const sb = await getAuthenticatedSupabase();
  if (!sb || !equipoId || !correo) return null;

  const { data: eq } = await sb.from("equipos").select("*").eq("id", equipoId).maybeSingle();
  if (!eq) return null;

  // Avoid duplicates: if there is already an open letter for this device and this
  // employee (draft/pending/signed), it is reused.
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

  const datos: CustodySnapshot = {
    equipo: deviceSnapshot(eq),
    accesorios: [],
    seguridad: [],
    observaciones: "",
    estado_fisico: "Usado — buen estado",
  };

  const { data: nueva, error } = await sb
    .from("responsivas")
    .insert({
      equipo_id: equipoId,
      plantilla: templateForDevice(eq.categoria ?? "computo", eq.tipo ?? "laptop"),
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

  revalidate(nueva?.id);
  return nueva?.id ?? null;
}

// The "Generar responsiva" button from inventory (device already assigned).
export async function createCustodyLetterForDevice(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const equipoId = formData.get("equipo_id") as string;
  const { data: eq } = await sb
    .from("equipos")
    .select("asignado_email")
    .eq("id", equipoId)
    .maybeSingle();
  if (!eq?.asignado_email) return;
  const id = await createCustodyLetter(equipoId, eq.asignado_email);
  if (id) redirect(`/ti/responsivas/${id}`);
}

// Edits the document data (accessories, security controls, observations, notes).
export async function editCustodyLetter(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;

  const { data: r } = await sb.from("responsivas").select("datos").eq("id", id).single();
  const datos = {
    ...jsonbObject<CustodySnapshot>(r?.datos, {} as CustodySnapshot),
    accesorios: formData.getAll("accesorios").map(String),
    seguridad: formData.getAll("seguridad").map(String),
    observaciones: ((formData.get("observaciones") as string) ?? "").trim(),
    estado_fisico: (formData.get("estado_fisico") as string) ?? "",
  };
  const notas = ((formData.get("notas") as string) ?? "").trim() || null;
  const fechaEntrega = ((formData.get("fecha_entrega") as string) ?? "").trim() || null;
  const personas = sanitizeParties(formData.get("personas"));

  const { error } = await sb
    .from("responsivas")
    .update({ datos, notas, fecha_entrega: fechaEntrega, personas })
    .eq("id", id);
  if (error) {
    console.error("[responsivas] editar:", error.message);
    return;
  }
  revalidate(id);
}

// Re-reads the device from inventory and refreshes the snapshot (`datos.equipo`
// plus `equipo_nombre`) of the UNSIGNED letters (draft/pending signature) linked
// to it, preserving accessories/security/observations/physical condition.
// Inventory calls this when a device is edited; signed letters are left alone for
// legal integrity — they are only refreshed by hand via `refreshFromInventory`.
export async function syncDeviceCustodyLetters(sb: SupabaseClient, equipoId: string) {
  if (!equipoId) return;
  const { data: eq } = await sb.from("equipos").select("*").eq("id", equipoId).maybeSingle();
  if (!eq) return;

  const { data: resps } = await sb
    .from("responsivas")
    .select("id, datos")
    .eq("equipo_id", equipoId)
    .in("estado", ["borrador", "pendiente_firma"]);
  if (!resps?.length) return;

  const equipo = deviceSnapshot(eq);
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
    revalidate(r.id);
  }
}

// The "Actualizar desde inventario" button on a custody letter: re-reads the
// linked device and refreshes its snapshot regardless of status. If the device no
// longer exists (equipo_id is null), it does nothing.
export async function refreshFromInventory(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
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
    ...jsonbObject<CustodySnapshot>(r.datos, {} as CustodySnapshot),
    equipo: deviceSnapshot(eq),
  };
  const { error } = await sb
    .from("responsivas")
    .update({ datos, equipo_nombre: eq.nombre })
    .eq("id", id);
  if (error) {
    console.error("[responsivas] actualizar desde inventario:", error.message);
    return;
  }
  revalidate(id);
}

// Uploads the signed scan/PDF to the Storage bucket and marks the letter signed.
export async function uploadSignedLetter(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
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
  revalidate(id);
}

export async function changeCustodyStatus(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
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
  revalidate(id);
}

export async function deleteCustodyLetter(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const archivo = formData.get("archivo_url") as string | null;
  if (archivo) await sb.storage.from("responsivas").remove([archivo]);
  const { error } = await sb.from("responsivas").delete().eq("id", id);
  if (error) {
    console.error("[responsivas] eliminar:", error.message);
    return;
  }
  revalidate();
}
