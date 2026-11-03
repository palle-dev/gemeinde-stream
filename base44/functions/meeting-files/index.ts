import { createClientFromRequest } from "npm:@base44/sdk";
import { maximumMeetingFileCount, meetingFileAuthorizationMatches, meetingFileStorageReference, normalizeMeetingFileMetadata, sameMeetingFileRegistration, validPrivateFileUri, validPublicFileUrl, type MeetingFileAuthorization } from "./logic.ts";

const encoder = new TextEncoder(); const decoder = new TextDecoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }
async function publicFile(base44: ReturnType<typeof createClientFromRequest>, file: Record<string, unknown>) { const uri = validPrivateFileUri(file.file_uri); const url = uri ? validPublicFileUrl((await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 900 })).signed_url) : validPublicFileUrl(file.file_url); if (!url) throw new Error("Gespeicherte Meetingdatei ist nicht mehr erreichbar"); return { id: file.file_id, name: file.name, url, mimeType: file.mime_type || "application/octet-stream", sizeBytes: Number(file.size_bytes), uploadedBy: file.uploaded_by_name, uploadedAt: file.uploaded_at, canDelete: false }; }
async function createUploadAuthorization(value: MeetingFileAuthorization, secret: string): Promise<string> { const payload = base64Url(JSON.stringify(value)); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return `${payload}.${base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))))}`; }
async function verifyUploadAuthorization(token: string, secret: string): Promise<Partial<MeetingFileAuthorization> | null> { try { const parts = token.length <= 4096 ? token.split(".") : []; const [payload, signature] = parts; if (parts.length !== 2 || !payload || !signature || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null; const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(signature), encoder.encode(payload))) return null; return JSON.parse(decoder.decode(decodeBase64UrlBytes(payload))); } catch { return null; } }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json(); const action = String(body.action ?? "list");
    if (!["list", "authorize-upload", "register", "delete"].includes(action)) return Response.json({ error: "Ungültige Dateiaktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null; try { user = await base44.auth.me(); } catch { user = null; }
    let eventId = String(body.eventId ?? ""); let member: Record<string, unknown> | null = null; const guestMode = Boolean(body.guestSession);
    if (guestMode) { const secret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || ""; if (!secret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 }); const session = await verifyGuestSession(String(body.guestSession), secret); eventId = session.eventId; member = await base44.asServiceRole.entities.RoomMember.get(session.memberId); if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden" }, { status: 403 }); }
    else if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const event = await base44.asServiceRole.entities.Event.get(eventId); if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });
    let role = String(member?.role || "participant");
    if (user) { const host = event.host_email === user.email; const memberships = host ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email }); member = memberships[0] || null; if (!host && !member && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 }); if (!host && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 }); role = host ? "host" : String(member?.role || "participant"); }
    if (action === "authorize-upload") {
      if (!user || guestMode) return Response.json({ error: "Gäste können Dateien herunterladen, aber nicht hochladen" }, { status: 403 });
      if (event.status === "ended") return Response.json({ error: "In einem beendeten Meeting können keine Dateien mehr hochgeladen werden" }, { status: 409 });
      const existingFiles = await base44.asServiceRole.entities.MeetingFile.filter({ event_id: event.id }, "created_date", maximumMeetingFileCount, 0);
      if (existingFiles.length >= maximumMeetingFileCount) return Response.json({ error: `Pro Meeting können maximal ${maximumMeetingFileCount} Dateien geteilt werden` }, { status: 409 });
      const metadata = normalizeMeetingFileMetadata(body as Record<string, unknown>);
      if (!metadata) return Response.json({ error: "Dateityp oder Dateigröße ist nicht zulässig" }, { status: 400 });
      const secret = Deno.env.get("FILE_UPLOAD_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!secret) return Response.json({ error: "Dateiupload ist noch nicht konfiguriert" }, { status: 503 });
      if (body.storageMode !== "private") return Response.json({ error: "Meetingdateien müssen privat gespeichert werden" }, { status: 400 });
      const authorization = await createUploadAuthorization({ ...metadata, eventId: event.id, userEmail: String(user.email), expiresAt: Date.now() + 5 * 60_000, storageMode: "private" }, secret);
      return Response.json({ authorization, storageMode: "private" });
    }
    if (action === "register") {
      if (!user || guestMode) return Response.json({ error: "Gäste können Dateien herunterladen, aber nicht hochladen" }, { status: 403 });
      if (event.status === "ended") return Response.json({ error: "In einem beendeten Meeting können keine Dateien mehr hochgeladen werden" }, { status: 409 });
      const metadata = normalizeMeetingFileMetadata(body as Record<string, unknown>); if (!metadata) return Response.json({ error: "Dateityp oder Dateigröße ist nicht zulässig" }, { status: 400 });
      const { id, name, mimeType, sizeBytes: size } = metadata;
      const secret = Deno.env.get("FILE_UPLOAD_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!secret) return Response.json({ error: "Dateiupload ist noch nicht konfiguriert" }, { status: 503 });
      const authorization = await verifyUploadAuthorization(String(body.authorization ?? ""), secret);
      if (!authorization || !meetingFileAuthorizationMatches(authorization, metadata, event.id, String(user.email))) return Response.json({ error: "Die Uploadfreigabe ist ungültig oder abgelaufen" }, { status: 403 });
      const storageReference = meetingFileStorageReference(authorization.storageMode, body.fileUri, body.fileUrl);
      if (!storageReference) return Response.json({ error: authorization.storageMode === "private" ? "Privater Dateiverweis ist ungültig" : "Dateilink ist ungültig" }, { status: 400 });
      const duplicate = await base44.asServiceRole.entities.MeetingFile.filter({ event_id: event.id, file_id: id }, "created_date", 1, 0);
      if (duplicate[0]) {
        if (!sameMeetingFileRegistration(duplicate[0], metadata, storageReference, String(user.email))) return Response.json({ error: "Dateikennung wird bereits verwendet" }, { status: 409 });
      } else {
        const existingFiles = await base44.asServiceRole.entities.MeetingFile.filter({ event_id: event.id }, "created_date", maximumMeetingFileCount, 0);
        if (existingFiles.length >= maximumMeetingFileCount) return Response.json({ error: `Pro Meeting können maximal ${maximumMeetingFileCount} Dateien geteilt werden` }, { status: 409 });
        await base44.asServiceRole.entities.MeetingFile.create({ event_id: event.id, file_id: id, name, ...storageReference, mime_type: mimeType, size_bytes: size, uploaded_by: String(user.email), uploaded_by_name: String(user.full_name || member?.display_name || user.email).slice(0, 80), uploaded_at: new Date().toISOString() });
      }
    }
    if (action === "delete") { const id = typeof body.id === "string" && /^[a-zA-Z0-9-]{8,100}$/.test(body.id) ? body.id : ""; if (!id) return Response.json({ error: "Dateikennung ist ungültig" }, { status: 400 }); const file = (await base44.asServiceRole.entities.MeetingFile.filter({ event_id: event.id, file_id: id }, "created_date", 1, 0))[0]; if (!file) return Response.json({ error: "Datei wurde nicht gefunden" }, { status: 404 }); const moderator = !guestMode && Boolean(user) && (user?.role === "admin" || ["host", "cohost", "operator"].includes(role)); if (!user || guestMode || (file.uploaded_by !== user.email && !moderator)) return Response.json({ error: "Diese Datei darf nicht entfernt werden" }, { status: 403 }); await base44.asServiceRole.entities.MeetingFile.delete(file.id); }
    const files = await base44.asServiceRole.entities.MeetingFile.filter({ event_id: event.id }, "-uploaded_at", 200, 0); const resolved = await Promise.allSettled(files.map(async (file) => ({ ...await publicFile(base44, file), canDelete: !guestMode && Boolean(user) && (file.uploaded_by === user?.email || user?.role === "admin" || ["host", "cohost", "operator"].includes(role)) }))); const visibleFiles = resolved.flatMap((result) => result.status === "fulfilled" ? [result.value] : []); const unavailableCount = resolved.length - visibleFiles.length; return Response.json({ files: visibleFiles, unavailableCount, canUpload: !guestMode && Boolean(user) && event.status !== "ended" });
  } catch (error) { const message = error instanceof Error ? error.message : "Unbekannter Fehler"; return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 }); }
});
