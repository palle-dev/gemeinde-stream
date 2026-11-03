export const maximumMeetingFileSize = 25 * 1024 * 1024;
export const maximumMeetingFileCount = 200;
export const allowedMeetingFileExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "jpg", "jpeg", "png", "webp"]);
const allowedMimeTypesByExtension: Record<string, Set<string>> = {
  pdf: new Set(["application/pdf"]), doc: new Set(["application/msword"]), docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  xls: new Set(["application/vnd.ms-excel"]), xlsx: new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  ppt: new Set(["application/vnd.ms-powerpoint"]), pptx: new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
  txt: new Set(["text/plain"]), md: new Set(["text/markdown", "text/plain"]), csv: new Set(["text/csv", "text/plain", "application/vnd.ms-excel"]),
  jpg: new Set(["image/jpeg"]), jpeg: new Set(["image/jpeg"]), png: new Set(["image/png"]), webp: new Set(["image/webp"]),
};

export interface MeetingFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MeetingFileAuthorization extends MeetingFileMetadata {
  eventId: string;
  userEmail: string;
  expiresAt: number;
  storageMode?: "private";
}

export function validPrivateFileUri(value: unknown): string | null {
  const uri = String(value ?? "").trim();
  return uri.startsWith("private/") && uri.length <= 2048 && !uri.includes("..") && !/[\\\u0000-\u001f]/.test(uri) ? uri : null;
}

export function validPublicFileUrl(value: unknown): string | null {
  try { const url = new URL(String(value ?? "")); return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 4096 ? url.toString() : null; }
  catch { return null; }
}

export function meetingFileStorageReference(storageMode: unknown, fileUri: unknown, fileUrl: unknown): { file_uri: string } | { file_url: string } | null {
  if (storageMode === "private") {
    const uri = validPrivateFileUri(fileUri);
    return uri ? { file_uri: uri } : null;
  }
  try {
    const url = validPublicFileUrl(fileUrl);
    return url ? { file_url: url } : null;
  } catch { return null; }
}

export function normalizeMeetingFileMetadata(value: Record<string, unknown>): MeetingFileMetadata | null {
  const id = String(value.id ?? "").trim();
  if (typeof value.name !== "string" || typeof value.mimeType !== "string") return null;
  const name = value.name.trim();
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const mimeType = value.mimeType.trim().toLowerCase();
  const sizeBytes = Number(value.sizeBytes);
  const mimeAllowed = mimeType === "application/octet-stream" || Boolean(allowedMimeTypesByExtension[extension]?.has(mimeType));
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(id) || !name || name.length > 180 || /[\u0000-\u001f\\/]/.test(name) || !allowedMeetingFileExtensions.has(extension) || !mimeType || mimeType.length > 100 || !mimeAllowed || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maximumMeetingFileSize) return null;
  return { id, name, mimeType, sizeBytes };
}

export function sameMeetingFileRegistration(file: Record<string, unknown>, metadata: MeetingFileMetadata, storageReference: { file_uri: string } | { file_url: string }, userEmail: string): boolean {
  return file.name === metadata.name && file.mime_type === metadata.mimeType && Number(file.size_bytes) === metadata.sizeBytes && file.uploaded_by === userEmail
    && ("file_uri" in storageReference ? file.file_uri === storageReference.file_uri : file.file_url === storageReference.file_url);
}

export function meetingFileAuthorizationMatches(authorization: Partial<MeetingFileAuthorization>, metadata: MeetingFileMetadata, eventId: string, userEmail: string, now = Date.now()): boolean {
  return authorization.storageMode === "private"
    && authorization.eventId === eventId
    && authorization.userEmail === userEmail
    && authorization.id === metadata.id
    && authorization.name === metadata.name
    && authorization.mimeType === metadata.mimeType
    && authorization.sizeBytes === metadata.sizeBytes
    && typeof authorization.expiresAt === "number"
    && Number.isFinite(authorization.expiresAt)
    && authorization.expiresAt > now;
}
