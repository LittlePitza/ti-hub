import "server-only";

// Recompresión de imágenes en el servidor. La foto ya viene comprimida a WebP
// desde el navegador al subir; esto es la pasada agresiva que corre cuando el
// ticket se archiva (almacenamiento en frío): reduce más el tamaño y la calidad
// porque un ticket archivado es de solo consulta.
//
// `sharp` es un módulo NATIVO: se importa de forma diferida (dynamic import)
// dentro de la función para que su carga no afecte el render de las páginas que
// solo encadenan este módulo. Si el binario no está disponible en el hosting,
// el catch devuelve null y el archivado sigue sin recomprimir (no rompe nada).
// `.rotate()` sin argumentos aplica la orientación EXIF antes de redimensionar.
export async function recomprimirArchivado(entrada: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(entrada, { failOn: "none" })
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 55 })
      .toBuffer();
  } catch (e) {
    console.error("[imagen] recompresión al archivar falló:", e);
    return null;
  }
}
