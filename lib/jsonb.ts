import type { Json } from "@/types/database";

// Bridge between Postgres `jsonb` columns and the domain shapes stored in them.
//
// The generated types give every jsonb column the `Json` union, which includes
// primitives. The shapes this app actually stores (Adjunto[], AccesosInv,
// DatosResponsiva…) are objects and arrays, so reading one back is a narrowing
// TypeScript cannot verify — the guarantee lives in the write path and in the
// schema, not in the type system.
//
// These three helpers exist so every such crossing is named and searchable in
// one place, instead of scattering `as unknown as T` through the actions.

/** Read a jsonb array column. Anything that is not an array becomes `[]`. */
export function jsonbList<T>(value: Json | null | undefined): T[] {
  return Array.isArray(value) ? (value as unknown as T[]) : [];
}

/** Read a jsonb object column, falling back when it is null or not an object. */
export function jsonbObject<T>(value: Json | null | undefined, fallback: T): T {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as T)
    : fallback;
}

/** Write a domain shape into a jsonb column. */
export function toJsonb(value: unknown): Json {
  return value as Json;
}
