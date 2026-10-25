import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const action = String(body.action ?? "");
    if (!eventId || !["update", "delete"].includes(action)) {
      return Response.json({ error: "Ungültige Veranstaltungsanfrage" }, { status: 400 });
    }

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event) return Response.json({ error: "Veranstaltung nicht gefunden" }, { status: 404 });
    if (event.host_email !== user.email && user.role !== "admin") {
      return Response.json({ error: "Nur der Host darf diese Veranstaltung verwalten" }, { status: 403 });
    }

    if (action === "delete") {
      if (event.status === "live") {
        return Response.json({ error: "Eine laufende Veranstaltung muss zuerst beendet werden" }, { status: 409 });
      }
      const [members, scenes] = await Promise.all([
        base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id }, "created_date", 500, 0),
        base44.asServiceRole.entities.Scene.filter({ event_id: event.id }, "created_date", 500, 0),
      ]);
      await Promise.all([
        ...members.map((member) => base44.asServiceRole.entities.RoomMember.delete(member.id)),
        ...scenes.map((scene) => base44.asServiceRole.entities.Scene.delete(scene.id)),
      ]);
      await base44.asServiceRole.entities.Event.delete(event.id);
      return Response.json({ deleted: true });
    }

    if (event.status === "live") {
      return Response.json({ error: "Eine laufende Veranstaltung kann nicht bearbeitet werden" }, { status: 409 });
    }
    const title = String(body.title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const description = String(body.description ?? "").trim().slice(0, 1000);
    const startsAt = String(body.startsAt ?? "");
    const parsedStart = new Date(startsAt);
    const maxParticipants = Math.round(Number(body.maxParticipants));
    if (!title || !startsAt || Number.isNaN(parsedStart.getTime()) || maxParticipants < 2 || maxParticipants > 500) {
      return Response.json({ error: "Titel, Startzeit oder Teilnehmerlimit sind ungültig" }, { status: 400 });
    }
    const changes = {
      title,
      description,
      starts_at: parsedStart.toISOString(),
      max_participants: maxParticipants,
      default_camera_on: Boolean(body.defaultCameraOn),
      default_microphone_on: Boolean(body.defaultMicrophoneOn),
    };
    const updated = await base44.asServiceRole.entities.Event.update(event.id, changes);
    const members = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id }, "created_date", 500, 0);
    await Promise.all(members.map((member) => base44.asServiceRole.entities.RoomMember.update(member.id, { event_title: title })));
    return Response.json({ event: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
