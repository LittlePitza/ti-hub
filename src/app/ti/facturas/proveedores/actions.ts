"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabase } from "@/lib/supabase/client";
import { reader } from "@/lib/utils/form";
import {
  CURRENCIES,
  RECURRENCES,
  addMonths,
  type Currency,
  type Recurrence,
} from "@/lib/domain/invoices";

function revalidate() {
  revalidatePath("/ti/facturas/proveedores");
  revalidatePath("/ti/facturas");
  revalidatePath("/ti");
}

// Form amount to a number or null; accepts "1,234.50" (commas stripped).
function amountFromForm(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validCurrency(v: string | null): Currency {
  return CURRENCIES.includes(v as Currency) ? (v as Currency) : "MXN";
}

function validRecurrence(v: string | null): Recurrence {
  return RECURRENCES.some((p) => p.value === v) ? (v as Recurrence) : "mensual";
}

// Fields shared by create and edit, read from the form.
function vendorFields(formData: FormData) {
  const v = reader(formData);
  return {
    nombre: v("nombre"),
    servicio: v("servicio"),
    contacto: v("contacto"),
    telefono: v("telefono"),
    correo: v("correo"),
    costo: amountFromForm(v("costo")), // null = costo variable
    moneda: validCurrency(v("moneda")),
    periodicidad: validRecurrence(v("periodicidad")),
    proximo_pago: v("proximo_pago"), // null = no schedule
    notas: v("notas"),
  };
}

export async function createVendor(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const { nombre, ...resto } = vendorFields(formData);
  if (!nombre) return;
  const { error } = await sb.from("proveedores").insert({ nombre, ...resto });
  if (error) {
    console.error("[proveedores] crear:", error.message);
    return;
  }
  revalidate();
}

export async function editVendor(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  const { nombre, ...resto } = vendorFields(formData);
  if (!id || !nombre) return;
  const { error } = await sb
    .from("proveedores")
    .update({ nombre, ...resto })
    .eq("id", id);
  if (error) {
    console.error("[proveedores] editar:", error.message);
    return;
  }
  revalidate();
}

// Enable/disable without deleting: an inactive vendor keeps its invoice history
// but stops being projected onto the schedule.
export async function toggleVendorActive(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  const { data: p } = await sb.from("proveedores").select("activo").eq("id", id).maybeSingle();
  if (!p) return;
  const { error } = await sb.from("proveedores").update({ activo: !p.activo }).eq("id", id);
  if (error) {
    console.error("[proveedores] alternar activo:", error.message);
    return;
  }
  revalidate();
}

export async function deleteVendor(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;
  // The vendor's invoices remain (FK on delete set null).
  const { error } = await sb.from("proveedores").delete().eq("id", id);
  if (error) {
    console.error("[proveedores] eliminar:", error.message);
    return;
  }
  revalidate();
}

// The schedule's only materialisation: creates the pending invoice for the
// current period (pre-filled from the vendor) and advances the `proximo_pago`
// anchor by one period (a one-off payment switches the schedule off).
export async function recordVendorPayment(formData: FormData) {
  const sb = await getAuthenticatedSupabase();
  if (!sb) return;
  const id = formData.get("id") as string;
  if (!id) return;

  const { data: p } = await sb.from("proveedores").select("*").eq("id", id).maybeSingle();
  if (!p || !p.proximo_pago) return;

  const { error } = await sb.from("facturas").insert({
    proveedor_id: p.id,
    concepto: p.servicio ? `${p.nombre} · ${p.servicio}` : p.nombre,
    monto: p.costo === null ? 0 : Number(p.costo),
    moneda: p.moneda,
    fecha_vencimiento: p.proximo_pago,
    notas: "Generada desde el calendario de proveedores.",
  });
  if (error) {
    console.error("[proveedores] registrar pago:", error.message);
    return;
  }

  const step = RECURRENCES.find((x) => x.value === p.periodicidad)?.meses ?? 1;
  const siguiente = step === 0 ? null : addMonths(p.proximo_pago, step);
  const { error: errAncla } = await sb
    .from("proveedores")
    .update({ proximo_pago: siguiente })
    .eq("id", id);
  if (errAncla) console.error("[proveedores] avanzar ancla:", errAncla.message);
  revalidate();
}
