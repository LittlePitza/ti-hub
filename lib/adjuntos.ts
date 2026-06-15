// Adjuntos de imagen en los reportes del portal del empleado.
// Las fotos se guardan en el bucket privado `tickets` de Storage; el ticket
// conserva una lista de referencias (path + nombre + tipo) en su columna `adjuntos`.
// Estas constantes y validaciones se comparten entre el selector (cliente) y la
// server action que sube los archivos, para que el límite sea uno solo.

export const MAX_ADJUNTOS = 5;
// La foto se comprime en el navegador antes de subir; este es el tope de lo que
// se ACEPTA ya guardado (red de seguridad en el servidor por si la compresión
// del navegador no estuviera disponible).
export const MAX_BYTES_ADJUNTO = 8 * 1024 * 1024; // 8 MB
// Tope del archivo ORIGINAL que el navegador acepta antes de comprimir: una foto
// de celular ronda 3-6 MB, así que 25 MB descarta solo archivos absurdos.
export const MAX_BYTES_ORIGEN = 25 * 1024 * 1024; // 25 MB

// Una referencia a una imagen ya guardada en Storage.
export type Adjunto = {
  path: string; // ruta dentro del bucket `tickets`
  nombre: string; // nombre original del archivo (para mostrar/descargar)
  tipo: string; // content-type (image/*)
  comprimido?: boolean; // ya recomprimida al archivar el ticket (no re-encoger)
};

export const esImagen = (tipo: string) => tipo.startsWith("image/");

export const esImagenValida = (f: { type: string; size: number }) =>
  esImagen(f.type) && f.size > 0 && f.size <= MAX_BYTES_ADJUNTO;
