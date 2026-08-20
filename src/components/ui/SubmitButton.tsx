"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

// Submit button with a busy state. useFormStatus reads the state of the enclosing
// <form> (it must be a descendant of one), so this is a drop-in replacement for
// any <button type="submit"> inside a <form action={serverAction}>: while the
// action runs it disables itself (preventing double submits), shows a spinner
// and — optionally — changes its label ("Guardar" -> "Guardando…"). The label is
// the primary signal; the spinner is the accent (see prefers-reduced-motion in CSS).
export default function SubmitButton({
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
