import { createClientFromRequest } from "npm:@base44/sdk";
import { nextSpotlightRevision, normalizeSpotlightKey } from "./logic.ts";

const encoder = new TextEncoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }
function publicState(event: Record<string, unknown>) { return { key: String(event.meeting_spotlight_key || "") || null, revision: Number(event.meeting_spotlight_revision || 0), updatedAt: String(event.meeting_spotlight_updated_at || "") }; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = String(body.action ?? "get");
    if (!["get", "set"].includes(action)) return Response.json({ error: "Ungültige Spotlight-Aktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    let eventId = String(body.eventId ?? "");
    let member: Record<string, unknown> | null = null;
    if (body.guestSession) {
      const secret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!secret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), secret);
      eventId = session.eventId;
      member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden" }, { status: 403 });
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
    }
    if (action === "get") return Response.json({ state: publicState(event), canManage: Boolean(user) && (user?.role === "admin" || ["host", "cohost", "operator"].includes(role)) });
    if (!user || (user.role !== "admin" && !["host", "cohost", "operator"].includes(role))) return Response.json({ error: "Nur die Moderation darf ein Spotlight setzen" }, { status: 403 });
    if (event.status === "ended") return Response.json({ error: "Das Meeting wurde bereits beendet" }, { status: 409 });
    let key: string;
    let revision: number;
    try { key = normalizeSpotlightKey(body.key); revision = nextSpotlightRevision(event.meeting_spotlight_revision); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Spotlight-Quelle ist ungültig" }, { status: 400 }); }
    const updated = await base44.asServiceRole.entities.Event.update(event.id, { meeting_spotlight_key: key, meeting_spotlight_revision: revision, meeting_spotlight_updated_at: new Date().toISOString() });
    return Response.json({ state: publicState(updated), canManage: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 });
  }
});
