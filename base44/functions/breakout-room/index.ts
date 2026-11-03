import { createClientFromRequest } from "npm:@base44/sdk";
import { AccessToken } from "npm:livekit-server-sdk";
import { eligibleBreakoutIdentities, normalizeBreakoutAssignments } from "./logic.ts";

const encoder = new TextEncoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }

function publicAssignment(assignment: Record<string, unknown> | null) {
  return assignment ? { breakoutId: assignment.breakout_id, breakoutName: assignment.breakout_name, active: assignment.active === true } : null;
}

function chunks<T>(values: T[], size = 25): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function settleBatches<T>(values: T[], operation: (value: T) => Promise<unknown>): Promise<{ succeeded: T[]; error?: unknown }> {
  const succeeded: T[] = [];
  for (const batch of chunks(values)) {
    const results = await Promise.allSettled(batch.map(operation));
    results.forEach((result, index) => { if (result.status === "fulfilled") succeeded.push(batch[index]); });
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") return { succeeded, error: rejected.reason };
  }
  return { succeeded };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = String(body.action ?? "status");
    const guestSecret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
    let user: Record<string, unknown> | null = null;
    try { user = await base44.auth.me(); } catch { user = null; }

    let eventId = String(body.eventId ?? "");
    let member: Record<string, unknown> | null = null;
    let participantIdentity = "";
    if (body.guestSession) {
      if (!guestSecret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), guestSecret);
      eventId = session.eventId;
      member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden oder noch nicht zugelassen" }, { status: 403 });
      participantIdentity = String(member.participant_identity || `guest-${session.guestId}`);
    } else if (!user) {
      return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });
    if (event.status === "ended") return Response.json({ error: "Dieses Meeting wurde bereits beendet" }, { status: 409 });

    let actorRole = String(member?.role || "");
    if (user) {
      const isHost = event.host_email === user.email;
      const memberships = isHost ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
      member = memberships[0] || null;
      if (!isHost && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 });
      actorRole = isHost ? "host" : String(member?.role || "");
      participantIdentity = isHost ? String(user.id) : String(member?.participant_identity || user.id);
    }
    if (!participantIdentity || (!member && actorRole !== "host")) return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 });

    const canManage = ["host", "cohost", "operator"].includes(actorRole);
    if (action === "configure") {
      if (!user || !canManage) return Response.json({ error: "Nur die Moderation darf Kleingruppen verwalten" }, { status: 403 });
      const members = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id }, "created_date", 500, 0);
      const knownIdentities = eligibleBreakoutIdentities(members);
      const normalized = normalizeBreakoutAssignments(body.assignments, knownIdentities);
      if (!normalized) return Response.json({ error: "Zuweisungen sind doppelt, widersprüchlich, ungültig oder nicht mehr zugelassen" }, { status: 400 });
      const existing = await base44.asServiceRole.entities.BreakoutAssignment.filter({ event_id: event.id, active: true }, "created_date", 500, 0);
      const created: Record<string, unknown>[] = [];
      for (const batch of chunks(normalized)) {
        const results = await Promise.allSettled(batch.map((entry) => base44.asServiceRole.entities.BreakoutAssignment.create({ event_id: event.id, participant_identity: entry.participantIdentity, breakout_id: entry.breakoutId, breakout_name: entry.breakoutName, active: true, assigned_by: String(user.email) })));
        results.forEach((result) => { if (result.status === "fulfilled") created.push(result.value as Record<string, unknown>); });
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected?.status === "rejected") {
          await settleBatches(created, (entry) => base44.asServiceRole.entities.BreakoutAssignment.delete(String(entry.id)));
          throw rejected.reason;
        }
      }
      const closedAt = new Date().toISOString();
      const closing = await settleBatches(existing, (entry: Record<string, unknown>) => base44.asServiceRole.entities.BreakoutAssignment.update(String(entry.id), { active: false, closed_at: closedAt }));
      if (closing.error) {
        await settleBatches(created, (entry) => base44.asServiceRole.entities.BreakoutAssignment.delete(String(entry.id)));
        await settleBatches(closing.succeeded, (entry: Record<string, unknown>) => base44.asServiceRole.entities.BreakoutAssignment.update(String(entry.id), { active: true, closed_at: entry.closed_at || undefined }));
        throw closing.error;
      }
      return Response.json({ configured: created.length, activeCount: created.length });
    }

    if (action === "close") {
      if (!user || !canManage) return Response.json({ error: "Nur die Moderation darf Kleingruppen beenden" }, { status: 403 });
      const active = await base44.asServiceRole.entities.BreakoutAssignment.filter({ event_id: event.id, active: true }, "created_date", 500, 0);
      const closing = await settleBatches(active, (entry: Record<string, unknown>) => base44.asServiceRole.entities.BreakoutAssignment.update(String(entry.id), { active: false, closed_at: new Date().toISOString() }));
      if (closing.error) {
        await settleBatches(closing.succeeded, (entry: Record<string, unknown>) => base44.asServiceRole.entities.BreakoutAssignment.update(String(entry.id), { active: true, closed_at: entry.closed_at || undefined }));
        throw closing.error;
      }
      return Response.json({ closed: active.length, activeCount: 0 });
    }

    const assignments = await base44.asServiceRole.entities.BreakoutAssignment.filter({ event_id: event.id, participant_identity: participantIdentity, active: true }, "created_date", 1, 0);
    const assignment = assignments[0] || null;
    if (action === "status") {
      const activeCount = canManage ? (await base44.asServiceRole.entities.BreakoutAssignment.filter({ event_id: event.id, active: true }, "created_date", 500, 0)).length : undefined;
      return Response.json({ assignment: publicAssignment(assignment), ...(activeCount === undefined ? {} : { activeCount }) });
    }
    if (action === "leave") {
      if (assignment) await base44.asServiceRole.entities.BreakoutAssignment.update(String(assignment.id), { active: false, closed_at: new Date().toISOString() });
      return Response.json({ left: Boolean(assignment) });
    }
    if (action !== "token" || !assignment) return Response.json({ error: action === "token" ? "Keine aktive Kleingruppe zugewiesen" : "Ungültige Aktion" }, { status: action === "token" ? 404 : 400 });

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) return Response.json({ error: "LiveKit ist noch nicht konfiguriert" }, { status: 503 });
    const role = ["speaker", "participant", "viewer"].includes(actorRole) ? actorRole : "participant";
    const displayName = String(member?.display_name || user?.full_name || user?.email || "Teilnehmer").slice(0, 80);
    const token = new AccessToken(apiKey, apiSecret, { identity: participantIdentity, name: displayName, metadata: JSON.stringify({ eventId: event.id, role, mode: "meeting", breakout: assignment.breakout_id }), ttl: "10m" });
    token.addGrant({ roomJoin: true, room: `${event.livekit_room_name}-breakout-${assignment.breakout_id}`, canPublish: role !== "viewer", canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: false, roomAdmin: false });
    return Response.json({ serverUrl, participantToken: await token.toJwt(), breakoutId: assignment.breakout_id, breakoutName: assignment.breakout_name, active: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 });
  }
});
