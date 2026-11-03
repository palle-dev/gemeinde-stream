import { createClientFromRequest } from "npm:@base44/sdk";
import { activePollState, archivedPollStates, normalizePollDefinition, pollResultsForViewer } from "./logic.ts";

const encoder = new TextEncoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }

async function listPollVotes(entity: { filter(query: Record<string, unknown>, sort: string, limit: number, skip: number): Promise<Array<Record<string, unknown>>> }, eventId: string, pollId: string): Promise<Array<Record<string, unknown>>> {
  const votes: Array<Record<string, unknown>> = [];
  const pageSize = 200;
  for (let skip = 0; skip < 10_000; skip += pageSize) {
    const page = await entity.filter({ event_id: eventId, poll_id: pollId }, "-created_date", pageSize, skip);
    votes.push(...page);
    if (page.length < pageSize) return votes;
  }
  throw new Error("Die Umfrage enthält ungewöhnlich viele Stimmendatensätze");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json(); const action = String(body.action ?? "get");
    if (!["get", "history", "open", "vote", "close", "clear"].includes(action)) return Response.json({ error: "Ungültige Umfrageaktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null; try { user = await base44.auth.me(); } catch { user = null; }
    let eventId = String(body.eventId ?? ""); let member: Record<string, unknown> | null = null; let voterIdentity = "";
    if (body.guestSession) {
      const secret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || ""; if (!secret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), secret); eventId = session.eventId; member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden" }, { status: 403 });
      voterIdentity = `guest-${session.guestId}`;
    } else if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const event = await base44.asServiceRole.entities.Event.get(eventId); if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });
    let role = String(member?.role || "participant");
    if (user) { const host = event.host_email === user.email; const memberships = host ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email }); member = memberships[0] || null; if (!host && !member && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 }); if (!host && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 }); role = host ? "host" : String(member?.role || "participant"); voterIdentity = String(user.id || user.email); }
    const canManage = Boolean(user) && (user?.role === "admin" || ["host", "cohost", "operator"].includes(role));
    if (["open", "close", "clear"].includes(action) && !canManage) return Response.json({ error: "Nur die Moderation darf Umfragen verwalten" }, { status: 403 });
    if (event.status === "ended" && !["get", "history"].includes(action)) return Response.json({ error: "Das Meeting wurde bereits beendet" }, { status: 409 });

    if (action === "open") {
      let definition; try { definition = normalizePollDefinition(body.question, body.options); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ungültige Umfrage" }, { status: 400 }); }
      const previousStates = await base44.asServiceRole.entities.MeetingPollState.filter({ event_id: event.id }, "-created_date", 500, 0);
      await Promise.all(previousStates.filter((row) => row.active !== false).map((row) => base44.asServiceRole.entities.MeetingPollState.update(row.id, { active: false, open: false, updated_at: new Date().toISOString() })));
      await base44.asServiceRole.entities.MeetingPollState.create({ event_id: event.id, owner_email: event.host_email, poll_id: crypto.randomUUID(), question: definition.question, options: definition.labels.map((label: string) => ({ id: crypto.randomUUID(), label })), open: true, active: true, show_results_while_open: body.showResultsWhileOpen !== false, revision: 1, updated_at: new Date().toISOString() });
    }
    const states = await base44.asServiceRole.entities.MeetingPollState.filter({ event_id: event.id }, "-created_date", 500, 0); let state = activePollState(states);
    const duplicateActiveStates = state ? states.filter((candidate) => candidate.id !== state.id && candidate.active !== false) : [];
    if (duplicateActiveStates.length) { await Promise.all(duplicateActiveStates.map((candidate) => base44.asServiceRole.entities.MeetingPollState.update(candidate.id, { active: false, open: false, updated_at: new Date().toISOString() }))); duplicateActiveStates.forEach((candidate) => { candidate.active = false; candidate.open = false; }); }
    if (action === "history") {
      const archived = archivedPollStates(states);
      const history: Array<Record<string, unknown>> = [];
      for (let offset = 0; offset < archived.length; offset += 10) {
        const batch = await Promise.all(archived.slice(offset, offset + 10).map(async (pollState) => {
          const votes = await listPollVotes(base44.asServiceRole.entities.MeetingPollVote, event.id, pollState.poll_id);
          return { id: pollState.poll_id, question: pollState.question, options: pollState.options, open: false, showResultsWhileOpen: true, resultsVisible: true, ...pollResultsForViewer(votes, "", pollState.options.map((option: { id: string }) => option.id), true), updatedAt: pollState.updated_at };
        }));
        history.push(...batch);
      }
      return Response.json({ history });
    }
    if (action === "vote") {
      const optionId = String(body.optionId ?? ""); if (!state || !state.open || !state.options.some((option: { id: string }) => option.id === optionId)) return Response.json({ error: "Diese Abstimmung ist nicht geöffnet" }, { status: 409 });
      const existing = await base44.asServiceRole.entities.MeetingPollVote.filter({ event_id: event.id, poll_id: state.poll_id, voter_identity: voterIdentity }, "-created_date", 10, 0);
      if (existing[0]) { await base44.asServiceRole.entities.MeetingPollVote.update(existing[0].id, { option_id: optionId }); await Promise.allSettled(existing.slice(1).map((vote) => base44.asServiceRole.entities.MeetingPollVote.delete(vote.id))); }
      else await base44.asServiceRole.entities.MeetingPollVote.create({ event_id: event.id, poll_id: state.poll_id, voter_identity: voterIdentity, option_id: optionId });
      const duplicates = await base44.asServiceRole.entities.MeetingPollVote.filter({ event_id: event.id, poll_id: state.poll_id, voter_identity: voterIdentity }, "-created_date", 10, 0);
      await Promise.allSettled(duplicates.slice(1).map((vote) => base44.asServiceRole.entities.MeetingPollVote.delete(vote.id)));
    }
    if (action === "close") { if (!state) return Response.json({ error: "Umfrage nicht gefunden" }, { status: 404 }); if (state.open) state = await base44.asServiceRole.entities.MeetingPollState.update(state.id, { open: false, revision: Number(state.revision || 0) + 1, updated_at: new Date().toISOString() }); }
    if (action === "clear") { if (state) await base44.asServiceRole.entities.MeetingPollState.update(state.id, { active: false, open: false, updated_at: new Date().toISOString() }); state = null; }
    if (!state) return Response.json({ poll: null, canManage });
    const votes = await listPollVotes(base44.asServiceRole.entities.MeetingPollVote, event.id, state.poll_id); const resultsVisible = canManage || !state.open || state.show_results_while_open !== false; const results = pollResultsForViewer(votes, voterIdentity, state.options.map((option: { id: string }) => option.id), resultsVisible);
    return Response.json({ poll: { id: state.poll_id, question: state.question, options: state.options, open: state.open, showResultsWhileOpen: state.show_results_while_open !== false, resultsVisible, ...results }, canManage });
  } catch (error) { const message = error instanceof Error ? error.message : "Unbekannter Fehler"; return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 }); }
});
