import { createClientFromRequest } from "npm:@base44/sdk";
import { attendanceDuration, attendancePageSize, attendanceRecordForReport, maximumAttendanceSessions, validAttendanceDisplayName, validAttendanceId } from "./logic.ts";

const encoder = new TextEncoder();
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> {
  try {
    const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts;
    if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("invalid");
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("invalid");
    const parsed = JSON.parse(decodeBase64Url(payload));
    if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt))) throw new Error("invalid");
    if (Number(parsed.expiresAt) < Date.now()) throw new Error("expired");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "expired") throw new Error("Die Gastsitzung ist abgelaufen");
    throw new Error("Ungültige Gastsitzung");
  }
}

async function attendanceReport(entity: { filter: (query: Record<string, unknown>, sort: string, limit: number, skip: number) => Promise<Array<Record<string, unknown>>> }, eventId: string): Promise<{ sessions: Array<Record<string, unknown>>; truncated: boolean; invalidRecords: number }> {
  const sessions: Array<Record<string, unknown>> = []; let skip = 0; let invalidRecords = 0; let previousPageSignature = "";
  while (skip < maximumAttendanceSessions) {
    const limit = Math.min(attendancePageSize, maximumAttendanceSessions - skip);
    const page = await entity.filter({ event_id: eventId }, "joined_at", limit, skip);
    if (!Array.isArray(page)) throw new Error("Das Anwesenheitsprotokoll konnte nicht gelesen werden");
    const signature = page.map((session) => String(session.id || "")).join("|");
    if (page.length > 0 && signature === previousPageSignature) throw new Error("Die Seitennavigation des Anwesenheitsprotokolls ist fehlgeschlagen");
    previousPageSignature = signature;
    for (const session of page) {
      const normalized = attendanceRecordForReport(session);
      if (!normalized) { invalidRecords += 1; continue; }
      sessions.push(normalized);
    }
    skip += page.length;
    if (page.length < limit) return { sessions, truncated: false, invalidRecords };
  }
  return { sessions, truncated: true, invalidRecords };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let parsed: unknown;
    try { parsed = await req.json(); } catch { return Response.json({ error: "Ungültige Anfrage" }, { status: 400 }); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
    const body = parsed as Record<string, unknown>;
    const action = String(body.action ?? "heartbeat");
    if (!["join", "heartbeat", "leave", "report"].includes(action)) return Response.json({ error: "Ungültige Anwesenheitsaktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null;
    try { user = await base44.auth.me(); } catch { user = null; }

    let eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    let member: Record<string, unknown> | null = null;
    let guest = false;
    let participantIdentity = "";
    if (body.guestSession) {
      const guestSecret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!guestSecret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), guestSecret);
      eventId = session.eventId; guest = true;
      member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden oder noch nicht zugelassen" }, { status: 403 });
      participantIdentity = String(member.participant_identity || `guest-${session.guestId}`);
    } else if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    if (!validAttendanceId(eventId)) return Response.json({ error: "Ungültige Veranstaltungskennung" }, { status: 400 });

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });

    let role = String(member?.role || "participant");
    let email = String(member?.user_email || "");
    let displayName = String(member?.display_name || "Teilnehmer");
    if (user) {
      const isHost = event.host_email === user.email;
      const memberships = isHost ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
      member = memberships.find((candidate: Record<string, unknown>) => candidate.status === "joined") || null;
      if (!isHost && !member && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 });
      if (!isHost && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 });
      role = isHost ? "host" : String(member?.role || "participant");
      email = String(user.email || "");
      const requestedName = typeof body.displayName === "string" ? body.displayName : "";
      displayName = String(requestedName || member?.display_name || user.full_name || user.email || "Teilnehmer").trim().slice(0, 80);
      participantIdentity = String(user.id);
    }

    if (!validAttendanceId(eventId) || !validAttendanceId(participantIdentity)) return Response.json({ error: "Ungültige Veranstaltungs- oder Teilnehmerkennung" }, { status: 400 });
    if (!validAttendanceDisplayName(displayName)) displayName = "Teilnehmer";

    if (action === "report") {
      if (!user || (user.role !== "admin" && !["host", "cohost", "operator"].includes(role))) return Response.json({ error: "Nur die Moderation darf das Anwesenheitsprotokoll einsehen" }, { status: 403 });
      return Response.json(await attendanceReport(base44.asServiceRole.entities.AttendanceSession, event.id));
    }

    if (action === "join" && event.status === "ended") return Response.json({ error: "Dieses Meeting ist bereits beendet" }, { status: 409 });
    const recent = await base44.asServiceRole.entities.AttendanceSession.filter({ event_id: event.id, participant_identity: participantIdentity }, "-joined_at", 100, 0);
    const openSessions = recent.filter((session: Record<string, unknown>) => !session.left_at);
    const openSession = openSessions[0];
    const now = new Date().toISOString();
    if (action === "join") {
      for (const session of openSessions) await base44.asServiceRole.entities.AttendanceSession.update(String(session.id), { left_at: now, last_seen_at: now, duration_seconds: attendanceDuration(String(session.joined_at), now) });
      const session = await base44.asServiceRole.entities.AttendanceSession.create({ event_id: event.id, participant_identity: participantIdentity, user_email: email, display_name: displayName, role, guest, joined_at: now, last_seen_at: now, duration_seconds: 0 });
      return Response.json({ sessionId: session.id });
    }
    if (!openSession) return Response.json({ active: false });
    if (action === "heartbeat") {
      await base44.asServiceRole.entities.AttendanceSession.update(String(openSession.id), { last_seen_at: now, duration_seconds: attendanceDuration(String(openSession.joined_at), now) });
      return Response.json({ active: true });
    }
    for (const session of openSessions) await base44.asServiceRole.entities.AttendanceSession.update(String(session.id), { left_at: now, last_seen_at: now, duration_seconds: attendanceDuration(String(session.joined_at), now) });
    return Response.json({ active: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 });
  }
});
