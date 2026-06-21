export function receiptUrlFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Receipt URL \(pre-Storage\):\s*(https?:\/\/\S+)/i);
  return m ? m[1] : null;
}

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
