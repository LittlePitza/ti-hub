// Adjuntos de imagen en los reportes del portal del empleado.
// Las fotos se guardan en el bucket privado `tickets` de Storage; el ticket
// conserva una lista de referencias (path + nombre + tipo) en su columna `adjuntos`.
// Estas constantes y validaciones se comparten entre el selector (cliente) y la
// server action que sube los archivos, para que el límite sea uno solo.

export const MAX_ADJUNTOS = 5;
export const MAX_BYTES_ADJUNTO = 8 * 1024 * 1024; // 8 MB por imagen

// Una referencia a una imagen ya guardada en Storage.
export type Adjunto = {
  path: string; // ruta dentro del bucket `tickets`
  nombre: string; // nombre original del archivo (para mostrar/descargar)
  tipo: string; // content-type (image/*)
};

export const esImagen = (tipo: string) => tipo.startsWith("image/");

export const esImagenValida = (f: { type: string; size: number }) =>
  esImagen(f.type) && f.size > 0 && f.size <= MAX_BYTES_ADJUNTO;
