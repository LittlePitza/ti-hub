// FormData readers shared by the server actions.
//
// Which one to use depends on the column being written, and getting it wrong is
// a runtime constraint violation rather than a type error:
//
//   nullable column          -> lector      (empty becomes null)
//   NOT NULL with a default  -> optionalReader   (empty is omitted, default applies)
//   NOT NULL, no default     -> lector + an explicit guard before the write
//
// Passing null to a NOT NULL column fails in Postgres, and because the actions
// only log the error and return, the user sees the form do nothing at all.

/** Nullable column: trims, and turns an empty field into null. */
export function reader(fd: FormData) {
  return (k: string) => (fd.get(k) as string)?.trim() || null;
}

/**
 * Column that is NOT NULL but has a database default: trims, and turns an empty
 * field into undefined so the key is omitted and the default takes effect.
 */
export function optionalReader(fd: FormData) {
  return (k: string) => (fd.get(k) as string)?.trim() || undefined;
}
