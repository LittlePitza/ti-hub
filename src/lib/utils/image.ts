import "server-only";

// Server-side image recompression. The photo already arrives compressed to WebP
// from the browser on upload; this is the aggressive pass that runs when the
// ticket is archived (cold storage): it cuts size and quality further because an
// archived ticket is read-only.
//
// `sharp` is a NATIVE module: it is imported lazily (dynamic import) inside the
// function so loading it does not slow down rendering of pages that merely reach
// this module transitively. If the binary is unavailable on the host, the catch
// returns null and archiving proceeds without recompressing — nothing breaks.
// `.rotate()` with no arguments applies the EXIF orientation before resizing.
export async function recompressForArchive(entrada: Buffer): Promise<Buffer | null> {
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
