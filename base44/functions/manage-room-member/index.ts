import { createClientFromRequest } from "npm:@base44/sdk";

const assignableRoles = ["cohost", "operator", "speaker", "participant", "viewer"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const participantIdentity = String(body.participantIdentity ?? "");
    const role = String(body.role ?? "");
    if (!eventId || !participantIdentity || !assignableRoles.includes(role)) {
      return Response.json({ error: "Ungültige Rollenänderung" }, { status: 400 });
    }

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event) return Response.json({ error: "Raum nicht gefunden" }, { status: 404 });
    if (event.host_email !== user.email && user.role !== "admin") {
      return Response.json({ error: "Nur der Host darf Rollen vergeben" }, { status: 403 });
    }

    const matches = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      participant_identity: participantIdentity,
    });
    const member = matches[0];
    if (!member) return Response.json({ error: "Teilnehmer wurde nicht gefunden" }, { status: 404 });
    if (member.user_email === event.host_email) {
      return Response.json({ error: "Die Host-Rolle kann nicht geändert werden" }, { status: 409 });
    }

    const canPublish = role !== "viewer";
    const canControl = role === "cohost" || role === "operator";
    const updated = await base44.asServiceRole.entities.RoomMember.update(member.id, {
      role,
      can_publish_audio: canPublish,
      can_publish_video: canPublish,
      can_share_screen: canPublish,
      can_control_program: canControl,
    });

    return Response.json({ member: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
