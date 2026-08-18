"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

// Botón de envío con estado "ocupado". useFormStatus lee el estado del <form>
// ascendiente (debe ser descendiente de él), así que es un reemplazo directo de
// cualquier <button type="submit"> dentro de un <form action={serverAction}>:
// mientras la acción corre, se deshabilita (evita doble envío), muestra un spinner
// y —opcionalmente— cambia su etiqueta ("Guardar" → "Guardando…"). La etiqueta es
// la señal primaria; el spinner es el realce (ver prefers-reduced-motion en CSS).
export default function BotonEnviar({
  children,
  ocupado,
  className = "boton",
  ...rest
}: { children: ReactNode; ocupado?: ReactNode } & ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      {...rest}
    >
      {pending && <span className="spinner" aria-hidden />}
      {pending ? (ocupado ?? children) : children}
    </button>
  );
}
