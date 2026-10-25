import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const { eventId } = await req.json();
    const event = await base44.asServiceRole.entities.Event.get(String(eventId ?? ""));
    if (!event) return Response.json({ error: "Raum nicht gefunden" }, { status: 404 });

    const memberships = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      user_email: user.email,
    });
    const isHost = event.host_email === user.email;
    if (!isHost && memberships.length === 0 && user.role !== "admin") {
      return Response.json({ error: "Kein Zugriff auf diesen Raum" }, { status: 403 });
    }

    const members = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id });
    return Response.json({ event, members });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
