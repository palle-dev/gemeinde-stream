import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const joinCode = String(body.joinCode ?? "").trim().toUpperCase();
    const displayName = String(body.displayName ?? user.full_name ?? user.email).trim();
    if (!joinCode || !displayName) {
      return Response.json({ error: "Raumcode und Anzeigename sind erforderlich" }, { status: 400 });
    }

    const matches = await base44.asServiceRole.entities.Event.filter({ join_code: joinCode });
    const event = matches[0];
    if (!event || event.status === "ended") {
      return Response.json({ error: "Raum nicht gefunden oder bereits beendet" }, { status: 404 });
    }

    const existing = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      user_email: user.email,
    });

    const assignedRole = existing[0]?.role ?? (event.mode === "meeting" ? "participant" : "speaker");
    const canPublish = assignedRole !== "viewer";
    const memberData = {
      event_id: event.id,
      event_title: event.title,
      event_mode: event.mode,
      user_email: user.email,
      display_name: displayName,
      role: assignedRole,
      status: "joined",
      can_publish_audio: canPublish,
      can_publish_video: canPublish,
      can_share_screen: canPublish,
      can_control_program: assignedRole === "cohost" || assignedRole === "operator",
      last_seen_at: new Date().toISOString(),
    };

    const member = existing[0]
      ? await base44.asServiceRole.entities.RoomMember.update(existing[0].id, memberData)
      : await base44.asServiceRole.entities.RoomMember.create(memberData);

    return Response.json({ eventId: event.id, member });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
