import "server-only";
import sharp from "sharp";

// Recompresión de imágenes en el servidor. La foto ya viene comprimida a WebP
// desde el navegador al subir; esto es la pasada agresiva que corre cuando el
// ticket se archiva (almacenamiento en frío): reduce más el tamaño y la calidad
// porque un ticket archivado es de solo consulta.
//
// `.rotate()` sin argumentos aplica la orientación EXIF antes de redimensionar.
// Devuelve null si sharp no pudo procesar el buffer (formato raro, archivo roto);
// quien llama deja la imagen como estaba.
export async function recomprimirArchivado(entrada: Buffer): Promise<Buffer | null> {
  try {
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
