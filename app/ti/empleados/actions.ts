"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAutenticado } from "@/lib/supabase";
import { lector } from "@/lib/form";

function refrescar() {
  revalidatePath("/ti/empleados");
  revalidatePath("/ti/inventario");
  revalidatePath("/ti");
}

// Guarda los valores por defecto de la firma de correo (sitio web, dirección y
// eslogan) en la fila única config_correo. Aplican a todas las firmas que se
// generen después. `id` es el empleado desde cuya página se editó (para volver).
export async function guardarAjustesFirma(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const { error } = await sb
    .from("config_correo")
    .update({
      firma_web: v("firma_web"),
      firma_direccion: v("firma_direccion"),
      firma_eslogan: v("firma_eslogan"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("[empleados] guardar ajustes de firma:", error.message);
    return;
  }
  const id = formData.get("id") as string;
  revalidatePath("/ti/empleados");
  if (id) {
    revalidatePath(`/ti/empleados/${id}/firma`);
    redirect(`/ti/empleados/${id}/firma?ajustes=1`);
  }
}

export async function crearEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const correo = v("correo")?.toLowerCase();
  if (!v("nombre") || !correo) return;
  const { error } = await sb.from("empleados").insert({
    nombre: v("nombre"),
    correo,
    departamento: v("departamento"),
    puesto: v("puesto"),
    extension: v("extension"),
  });
  if (error) {
    console.error("[empleados] crear:", error.message);
    return;
  }
  refrescar();
}

export async function cambiarEstadoEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const { error } = await sb
    .from("empleados")
    .update({ estado: formData.get("estado") as string })
    .eq("id", formData.get("id") as string);
  if (error) {
    console.error("[empleados] cambiar estado:", error.message);
    return;
  }
  refrescar();
}

// Edición completa del empleado. Si cambia el correo, se actualizan también los
// equipos vinculados (asignado_email) para no romper el enlace con el portal.
export async function editarEmpleado(formData: FormData) {
  const sb = await getSupabaseAutenticado();
  if (!sb) return;
  const v = lector(formData);
  const id = formData.get("id") as string;
  const nombre = v("nombre");
  const correoNuevo = v("correo")?.toLowerCase();
  if (!id || !nombre || !correoNuevo) return;

  const { data: previo } = await sb.from("empleados").select("correo").eq("id", id).maybeSingle();

  const { error } = await sb
    .from("empleados")
    .update({
      nombre,
      correo: correoNuevo,
      departamento: v("departamento"),
      puesto: v("puesto"),
      extension: v("extension"),
    })
    .eq("id", id);
  if (error) {
    console.error("[empleados] editar:", error.message);
    return;
  }

  if (previo?.correo && previo.correo !== correoNuevo) {
    const { error: errEq } = await sb
      .from("equipos")
      .update({ asignado_a: nombre, asignado_email: correoNuevo })
      .eq("asignado_email", previo.correo);
    if (errEq) console.error("[empleados] actualizar equipos vinculados:", errEq.message);
  } else if (previo?.correo) {
    // Mantener el nombre desnormalizado del inventario al día.
    const { error: errEq } = await sb
      .from("equipos")
      .update({ asignado_a: nombre })
      .eq("asignado_email", correoNuevo);
    if (errEq) console.error("[empleados] actualizar equipos vinculados:", errEq.message);
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
    const { error: errEq } = await sb
      .from("equipos")
      .update({ asignado_a: null, asignado_email: null })
      .eq("asignado_email", emp.correo);
    if (errEq) console.error("[empleados] liberar equipos:", errEq.message);
  }
  const { error } = await sb.from("empleados").delete().eq("id", id);
  if (error) {
    console.error("[empleados] eliminar:", error.message);
    return;
  }
  refrescar();
}
