export const storage = { backend: "local-files" } as const;
export interface FileReference { fullPath: string; }
export const ref = (_storage: typeof storage, key: string): FileReference => ({ fullPath: key });
const url = (file: FileReference) => `/api/local/files/${file.fullPath.split("/").map(encodeURIComponent).join("/")}`;
export async function uploadBytes(file: FileReference, data: Blob | Uint8Array | ArrayBuffer, metadata?: { contentType?: string }) {
  const response = await fetch(url(file), {
    method: "PUT", headers: { "Content-Type": metadata?.contentType || (data instanceof Blob ? data.type : "") || "image/png" }, body: data as BodyInit,
  });
  if (!response.ok) throw new Error("Local upload failed");
  return { ref: file };
}
export const getDownloadURL = async (file: FileReference) => url(file);
export async function deleteObject(file: FileReference) {
  const response = await fetch(url(file), { method: "DELETE" });
  if (!response.ok) throw new Error(`Local image deletion failed (${response.status})`);
}
