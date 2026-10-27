import { createClientFromRequest } from "npm:@base44/sdk";
import { AccessToken, RoomServiceClient, TrackSource } from "npm:livekit-server-sdk";

function apiUrl(url: string) {
  return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}
function isLocalServer(url: string) { try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname); } catch { return false; } }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const { eventId, displayName } = await req.json();
    const event = await base44.asServiceRole.entities.Event.get(String(eventId ?? ""));
    if (!event) return Response.json({ error: "Raum nicht gefunden" }, { status: 404 });
    if (event.status === "ended") {
      return Response.json({ error: "Diese Veranstaltung wurde bereits beendet" }, { status: 409 });
    }

    const memberships = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      user_email: user.email,
    });
    const member = memberships[0];
    const isHost = event.host_email === user.email;
    if (!isHost && !member && user.role !== "admin") {
      return Response.json({ error: "Kein Zugriff auf diesen Raum" }, { status: 403 });
    }
    if (!isHost && member?.status === "waiting") {
      return Response.json({ waitingForApproval: true, role: member.role ?? "participant" });
    }
    if (!isHost && member?.status === "blocked") {
      return Response.json({ error: "Der Host hat den Beitritt zu diesem Raum abgelehnt" }, { status: 403 });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) {
      return Response.json({ error: "LiveKit ist noch nicht konfiguriert" }, { status: 503 });
    }

    let participants: Array<{ identity: string }> = [];
    if (isLocalServer(serverUrl)) {
      const joined = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, status: "joined" }, "created_date", 500, 0);
      participants = joined.flatMap((candidate) => candidate.participant_identity ? [{ identity: candidate.participant_identity }] : []);
    } else {
      try {
        participants = await new RoomServiceClient(apiUrl(serverUrl), apiKey, apiSecret).listParticipants(event.livekit_room_name);
      } catch (error) {
        if (!String(error).toLowerCase().includes("not found")) throw error;
      }
    }
    const alreadyConnected = participants.some((participant) => participant.identity === user.id);
    const maxParticipants = Number(event.max_participants ?? 50);
    if (!alreadyConnected && participants.length >= maxParticipants) {
      return Response.json({ error: `Der Raum ist mit ${maxParticipants} Personen vollständig belegt` }, { status: 409 });
    }

    const role = isHost ? "host" : (member?.role ?? "participant");
    if (member && (member.participant_identity !== user.id || member.status !== "joined")) {
      await base44.asServiceRole.entities.RoomMember.update(member.id, {
        participant_identity: user.id,
        status: "joined",
        last_seen_at: new Date().toISOString(),
      });
    }
    const canPublishAudio = isHost || Boolean(member?.can_publish_audio);
    const canPublishVideo = isHost || Boolean(member?.can_publish_video);
    const canShareScreen = isHost || Boolean(member?.can_share_screen);
    const canPublishSources = [
      ...(canPublishAudio ? [TrackSource.MICROPHONE] : []),
      ...(canPublishVideo ? [TrackSource.CAMERA] : []),
      ...(canShareScreen ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
    ];
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
      canPublish: canPublishSources.length > 0,
      canPublishSources,
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
