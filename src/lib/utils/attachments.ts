// Image attachments on employee-portal reports.
// Photos are stored in the private `tickets` Storage bucket; the ticket keeps a
// list of references (path + name + type) in its `adjuntos` column.
// These constants and checks are shared by the picker (client) and the server
// action that uploads the files, so the limit is defined exactly once.

export const MAX_ATTACHMENTS = 5;
// The photo is compressed in the browser before upload; this is the cap on what
// is ACCEPTED once stored — a server-side safety net in case browser compression
// was unavailable.
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
// Cap on the ORIGINAL file the browser accepts before compressing: a phone photo
// is around 3-6 MB, so 25 MB rejects only absurd files.
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 25 MB

// A reference to an image already stored in Storage.
export type Attachment = {
  path: string; // path inside the `tickets` bucket
  nombre: string; // original filename (for display and download)
  tipo: string; // content-type (image/*)
  comprimido?: boolean; // already recompressed when the ticket was archived (do not shrink again)
};

export const isImage = (tipo: string) => tipo.startsWith("image/");

export const isValidImage = (f: { type: string; size: number }) =>
  isImage(f.type) && f.size > 0 && f.size <= MAX_ATTACHMENT_BYTES;
