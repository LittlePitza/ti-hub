// Lector de campos de FormData compartido por las server actions: recorta
// espacios y convierte vacío en null (lo que esperan las columnas opcionales).
// Uso: const v = lector(formData); v("titulo")
export function lector(fd: FormData) {
  return (k: string) => (fd.get(k) as string)?.trim() || null;
}
