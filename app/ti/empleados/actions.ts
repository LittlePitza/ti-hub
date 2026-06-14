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

// Edición completa del empleado. Si cambia el correo, se actualizan también los
// equipos vinculados (asignado_email) para no romper el enlace con el portal.
export async function editarEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = (k: string) => (formData.get(k) as string)?.trim() || null;
  const id = formData.get("id") as string;
  const nombre = v("nombre");
  const correoNuevo = v("correo")?.toLowerCase();
  if (!id || !nombre || !correoNuevo) return;

  const { data: previo } = await sb.from("empleados").select("correo").eq("id", id).maybeSingle();

  await sb.from("empleados").update({
    nombre,
    correo: correoNuevo,
    departamento: v("departamento"),
    puesto: v("puesto"),
    extension: v("extension"),
  }).eq("id", id);

  if (previo?.correo && previo.correo !== correoNuevo) {
    await sb.from("equipos")
      .update({ asignado_a: nombre, asignado_email: correoNuevo })
      .eq("asignado_email", previo.correo);
  } else if (previo?.correo) {
    // Mantener el nombre desnormalizado del inventario al día.
    await sb.from("equipos").update({ asignado_a: nombre }).eq("asignado_email", correoNuevo);
  }
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
