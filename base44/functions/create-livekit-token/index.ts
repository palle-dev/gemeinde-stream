import { createClientFromRequest } from "npm:@base44/sdk";
import { AccessToken } from "npm:livekit-server-sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const { eventId, displayName } = await req.json();
    const event = await base44.asServiceRole.entities.Event.get(String(eventId ?? ""));
    if (!event) return Response.json({ error: "Raum nicht gefunden" }, { status: 404 });

    const memberships = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      user_email: user.email,
    });
    const member = memberships[0];
    const isHost = event.host_email === user.email;
    if (!isHost && !member && user.role !== "admin") {
      return Response.json({ error: "Kein Zugriff auf diesen Raum" }, { status: 403 });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) {
      return Response.json({ error: "LiveKit ist noch nicht konfiguriert" }, { status: 503 });
    }

    const role = isHost ? "host" : (member?.role ?? "participant");
    const canPublish = role !== "viewer";
    const requestedName = String(displayName ?? "").trim().slice(0, 80);
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: requestedName || member?.display_name || user.full_name || user.email,
      metadata: JSON.stringify({ eventId: event.id, role, mode: event.mode }),
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: event.livekit_room_name,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
      roomAdmin: isHost || role === "cohost" || role === "operator",
    });

    return Response.json({
      serverUrl,
      participantToken: await token.toJwt(),
      role,
      canControlProgram: isHost || role === "cohost" || role === "operator",
      canModerate: isHost || role === "cohost" || role === "operator",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
