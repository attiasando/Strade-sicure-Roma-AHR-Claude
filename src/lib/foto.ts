// Foto della segnalazione: riscrittura nel browser prima del caricamento.
// Ridisegnare l'immagine su un canvas elimina EXIF e posizione GPS (la posizione dell'utente non deve mai uscire dal telefono)
// e riduce il peso. Funzione solo da browser: non è coperta dai test automatici.
const LATO_MAX = 1600;

export async function ripulisciFoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scala = Math.min(1, LATO_MAX / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scala));
    canvas.height = Math.max(1, Math.round(img.height * scala));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Foto non convertibile"))), "image/jpeg", 0.85));
  } finally { img.close(); }
}
