import { createClientFromRequest } from "npm:@base44/sdk";
import { canDeleteChatMessage, chatRateLimited, normalizeChatMessageId, normalizeChatSubmission, sameChatSubmission } from "./logic.ts";

const encoder = new TextEncoder();
function base64Url(value: Uint8Array | string): string { const bytes = typeof value === "string" ? encoder.encode(value) : value; let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decodeBase64Url(value: string): string { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
function decodeBase64UrlBytes(value: string): Uint8Array { const binary = decodeBase64Url(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function verifyGuestSession(token: string, secret: string): Promise<{ guestId: string; eventId: string; memberId: string; expiresAt: number }> { const parts = token.length <= 2048 ? token.split(".") : []; const [payload, provided] = parts; if (parts.length !== 2 || !payload || !provided || payload.length > 1024 || provided.length > 128 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) throw new Error("Ungültige Gastsitzung"); const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); if (!await crypto.subtle.verify("HMAC", key, decodeBase64UrlBytes(provided), encoder.encode(payload))) throw new Error("Ungültige Gastsitzung"); const parsed = JSON.parse(decodeBase64Url(payload)); if (typeof parsed.guestId !== "string" || typeof parsed.eventId !== "string" || typeof parsed.memberId !== "string" || !parsed.guestId || !parsed.eventId || !parsed.memberId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) < Date.now()) throw new Error("Die Gastsitzung ist abgelaufen"); return parsed; }

function publicMessage(message: Record<string, unknown>) {
  return {
    id: message.message_id,
    senderIdentity: message.sender_identity,
    senderName: message.sender_name,
    recipientIdentity: message.recipient_identity || undefined,
    recipientName: message.recipient_name || undefined,
    text: message.text,
    sentAt: Date.parse(String(message.sent_at)),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = String(body.action ?? "list");
    if (!["list", "send", "delete"].includes(action)) return Response.json({ error: "Ungültige Chataktion" }, { status: 400 });
    let user: Record<string, unknown> | null = null;
    try { user = await base44.auth.me(); } catch { user = null; }

    let eventId = String(body.eventId ?? "");
    let member: Record<string, unknown> | null = null;
    let actorIdentity = "";
    let actorName = "";
    let actorRole = "participant";
    if (body.guestSession) {
      const guestSecret = Deno.env.get("GUEST_SESSION_SECRET") || Deno.env.get("LIVEKIT_API_SECRET") || "";
      if (!guestSecret) return Response.json({ error: "Gastzugang ist nicht konfiguriert" }, { status: 503 });
      const session = await verifyGuestSession(String(body.guestSession), guestSecret);
      eventId = session.eventId;
      member = await base44.asServiceRole.entities.RoomMember.get(session.memberId);
      if (!member || member.event_id !== eventId || member.user_email !== `guest+${session.guestId}@guest.invalid` || member.status !== "joined") return Response.json({ error: "Gastsitzung wurde nicht gefunden oder noch nicht zugelassen" }, { status: 403 });
      actorIdentity = `guest-${session.guestId}`;
      actorName = String(member.display_name || "Gast").slice(0, 80);
    } else if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event || event.mode !== "meeting") return Response.json({ error: "Meeting wurde nicht gefunden" }, { status: 404 });
    if (user) {
      const isHost = event.host_email === user.email;
      const memberships = isHost ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
      member = memberships[0] || null;
      if (!isHost && !member && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf dieses Meeting" }, { status: 403 });
      if (!isHost && member?.status !== "joined" && user.role !== "admin") return Response.json({ error: "Noch nicht für dieses Meeting zugelassen" }, { status: 403 });
      actorIdentity = String(user.id || user.email);
      actorName = String(user.full_name || member?.display_name || user.email || "Teilnehmer").slice(0, 80);
      actorRole = user.role === "admin" ? "admin" : isHost ? "host" : String(member?.role || "participant");
    }

    if (action === "list") {
      const [publicMessages, receivedMessages, sentMessages] = await Promise.all([
        base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, recipient_identity: "" }, "-sent_at", 100, 0),
        base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, recipient_identity: actorIdentity }, "-sent_at", 100, 0),
        base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, sender_identity: actorIdentity }, "-sent_at", 100, 0),
      ]);
      const unique = new Map<string, Record<string, unknown>>();
      [...publicMessages, ...receivedMessages, ...sentMessages].forEach((message: Record<string, unknown>) => unique.set(String(message.message_id), message));
      const visible = [...unique.values()].sort((left, right) => Date.parse(String(right.sent_at)) - Date.parse(String(left.sent_at))).slice(0, 100).reverse();
      return Response.json({ messages: visible.map(publicMessage) });
    }

    if (action === "delete") {
      const messageId = normalizeChatMessageId(body.messageId);
      if (!messageId) return Response.json({ error: "Die Nachrichtenkennung ist ungültig" }, { status: 400 });
      const messages = await base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, message_id: messageId }, "created_date", 10, 0);
      if (messages.length === 0) return Response.json({ error: "Nachricht wurde nicht gefunden" }, { status: 404 });
      if (messages.some((message) => !canDeleteChatMessage(message, actorIdentity, actorRole))) {
        return Response.json({ error: "Sie dürfen diese Nachricht nicht löschen" }, { status: 403 });
      }
      await Promise.all(messages.map((message) => base44.asServiceRole.entities.MeetingMessage.delete(message.id)));
      return Response.json({ removed: true, messageId });
    }

    if (event.status === "ended") return Response.json({ error: "In einem beendeten Meeting können keine Nachrichten gesendet werden" }, { status: 409 });
    let submission; try { submission = normalizeChatSubmission(body); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Die Nachricht ist ungültig" }, { status: 400 }); }
    const duplicate = (await base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, message_id: submission.id }, "created_date", 1, 0))[0];
    if (duplicate) {
      if (!sameChatSubmission(duplicate, actorIdentity, submission)) return Response.json({ error: "Nachrichtenkennung wird bereits verwendet" }, { status: 409 });
      return Response.json({ message: publicMessage(duplicate) });
    }
    const recent = await base44.asServiceRole.entities.MeetingMessage.filter({ event_id: event.id, sender_identity: actorIdentity }, "-sent_at", 20, 0);
    if (chatRateLimited(recent)) return Response.json({ error: "Zu viele Nachrichten. Bitte warten Sie einen Moment." }, { status: 429 });
    const saved = await base44.asServiceRole.entities.MeetingMessage.create({ event_id: event.id, message_id: submission.id, sender_identity: actorIdentity, sender_name: actorName, recipient_identity: submission.recipientIdentity, recipient_name: submission.recipientName, text: submission.text, sent_at: new Date().toISOString() });
    return Response.json({ message: publicMessage(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return Response.json({ error: message }, { status: message.includes("Gastsitzung") ? 401 : 500 });
  }
});
