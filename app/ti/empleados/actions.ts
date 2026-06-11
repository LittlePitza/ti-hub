"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAutenticado } from "@/lib/supabase";

function refrescar() {
  revalidatePath("/ti/empleados");
  revalidatePath("/ti/inventario");
  revalidatePath("/ti");
}

export async function crearEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const correo = v("correo")?.toLowerCase();
  if (!v("nombre") || !correo) return;
  await sb.from("empleados").insert({
    nombre: v("nombre"),
    correo,
    departamento: v("departamento"),
    puesto: v("puesto"),
    extension: v("extension"),
  });
  refrescar();
}

export async function cambiarEstadoEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  await sb.from("empleados")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  refrescar();
}

export async function eliminarEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const id = formData.get("id") as string;
  const { data: emp } = await sb.from("empleados").select("correo").eq("id", id).maybeSingle();
  // Sus equipos quedan libres (se conserva el historial de tickets por correo).
  if (emp?.correo) {
    await sb.from("equipos")
      .update({ asignado_a: null, asignado_email: null })
      .eq("asignado_email", emp.correo);
  }
  await sb.from("empleados").delete().eq("id", id);
  refrescar();
}
