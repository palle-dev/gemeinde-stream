import { createClientFromRequest } from "npm:@base44/sdk";
import { meetingNoteVersionsToDelete, nextMeetingNoteRevision, normalizeMeetingNoteSave } from "./logic.ts";

const encoder = new TextEncoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }

function publicNote(note: Record<string, unknown> | null) {
  return note ? { content: note.content, revision: note.revision, updatedBy: note.updated_by, updatedAt: note.updated_at } : { content: "", revision: 0, updatedBy: "", updatedAt: "" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = String(body.action ?? "get");
    if (!["get", "history", "save"].includes(action)) return Response.json({ error: "Ungültige Notizaktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null;
    try { user = await base44.auth.me(); } catch { user = null; }

    let eventId = String(body.eventId ?? "");
    let member: Record<string, unknown> | null = null;
    let actorName = "";
    if (body.guestSession) {
      const guestSecret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!guestSecret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), guestSecret);
      eventId = session.eventId;
      member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden oder noch nicht zugelassen" }, { status: 403 });
      actorName = String(member.display_name || "Gast");
    } else if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });
    let role = String(member?.role || "participant");
    if (user) {
      const isHost = event.host_email === user.email;
      const memberships = isHost ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
      member = memberships[0] || null;
      if (!isHost && !member && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 });
      if (!isHost && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 });
      role = isHost ? "host" : String(member?.role || "participant");
      actorName = String(user.full_name || user.email || "Teilnehmer").slice(0, 80);
    }

    const notes = await base44.asServiceRole.entities.MeetingNote.filter({ event_id: event.id }, "-revision", 2, 0);
    const note = notes[0] || null;
    if (action === "get") return Response.json({ note: publicNote(note), canEdit: event.status !== "ended" && role !== "viewer" });
    if (action === "history") return Response.json({ history: notes.length > 0 ? (await base44.asServiceRole.entities.MeetingNote.filter({ event_id: event.id }, "-revision", 20, 0)).map((version) => publicNote(version)) : [], canEdit: event.status !== "ended" && role !== "viewer" });
    if (event.status === "ended") return Response.json({ error: "Notizen eines beendeten Meetings können nicht mehr geändert werden" }, { status: 409 });
    if (role === "viewer") return Response.json({ error: "Zuschauer dürfen die gemeinsamen Notizen nicht bearbeiten" }, { status: 403 });
    const saveInput = normalizeMeetingNoteSave(body as Record<string, unknown>);
    if (!saveInput) return Response.json({ error: "Notizinhalt oder Revisionsstand ist ungültig" }, { status: 400 });
    const { content, expectedRevision } = saveInput;
    const currentRevision = Number(note?.revision || 0);
    if (expectedRevision !== currentRevision) return Response.json({ error: "Die Notizen wurden zwischenzeitlich geändert", conflict: true, note: publicNote(note) }, { status: 409 });
    const updatedAt = new Date().toISOString();
    const values = { event_id: event.id, content, revision: nextMeetingNoteRevision(currentRevision), updated_by: actorName, updated_at: updatedAt };
    const saved = await base44.asServiceRole.entities.MeetingNote.create(values);
    while (true) {
      const versions = await base44.asServiceRole.entities.MeetingNote.filter({ event_id: event.id }, "-revision", 300, 0);
      const stale = meetingNoteVersionsToDelete(versions);
      if (!stale.length) break;
      await Promise.all(stale.map((version) => base44.asServiceRole.entities.MeetingNote.delete(String(version.id)).catch(() => undefined)));
      if (versions.length < 300) break;
    }
    return Response.json({ note: publicNote(saved), canEdit: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 });
  }
});
