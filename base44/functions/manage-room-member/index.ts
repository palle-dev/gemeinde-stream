import { createClientFromRequest } from "npm:@base44/sdk";

const assignableRoles = ["cohost", "operator", "speaker", "participant", "viewer"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const action = String(body.action ?? "assign");
    const participantIdentity = String(body.participantIdentity ?? "");
    const role = String(body.role ?? "");
    if (!eventId || !["assign", "list", "invite", "remove", "admit", "reject"].includes(action)) {
      return Response.json({ error: "Ungültige Mitgliederanfrage" }, { status: 400 });
    }

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event) return Response.json({ error: "Raum nicht gefunden" }, { status: 404 });
    const actorMemberships = event.host_email === user.email || user.role === "admin"
      ? []
      : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
    const actorRole = event.host_email === user.email ? "host" : actorMemberships[0]?.role;
    if (user.role !== "admin" && !["host", "cohost", "operator"].includes(String(actorRole))) {
      return Response.json({ error: "Nur die Moderation darf Mitglieder verwalten" }, { status: 403 });
    }

    if (action === "list") {
      const members = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id }, "created_date", 500, 0);
      return Response.json({ members });
    }

    if (action === "invite") {
      if (event.host_email !== user.email && user.role !== "admin") {
        return Response.json({ error: "Nur der Host darf Personen vorab einladen" }, { status: 403 });
      }
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !assignableRoles.includes(role) || email === event.host_email.toLowerCase()) {
        return Response.json({ error: "E-Mail-Adresse oder Rolle ist ungültig" }, { status: 400 });
      }
      const existing = await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: email });
      const canPublish = role !== "viewer";
      const memberData = {
        event_id: event.id,
        event_title: event.title,
        event_mode: event.mode,
        user_email: email,
        display_name: existing[0]?.display_name || email.split("@")[0],
        role,
        status: existing[0]?.status === "joined" ? "joined" : "invited",
        can_publish_audio: canPublish,
        can_publish_video: canPublish,
        can_share_screen: canPublish,
        can_control_program: role === "cohost" || role === "operator",
      };
      const member = existing[0]
        ? await base44.asServiceRole.entities.RoomMember.update(existing[0].id, memberData)
        : await base44.asServiceRole.entities.RoomMember.create(memberData);
      return Response.json({ member });
    }

    if (action === "remove") {
      const memberId = String(body.memberId ?? "");
      const member = memberId ? await base44.asServiceRole.entities.RoomMember.get(memberId) : null;
      if (!member || member.event_id !== event.id) return Response.json({ error: "Mitglied nicht gefunden" }, { status: 404 });
      if (member.user_email === event.host_email) return Response.json({ error: "Der Host kann nicht entfernt werden" }, { status: 409 });
      await base44.asServiceRole.entities.RoomMember.delete(member.id);
      return Response.json({ removed: true });
    }

    if (action === "admit" || action === "reject") {
      const memberId = String(body.memberId ?? "");
      const member = memberId ? await base44.asServiceRole.entities.RoomMember.get(memberId) : null;
      if (!member || member.event_id !== event.id || member.status !== "waiting") {
        return Response.json({ error: "Wartende Person wurde nicht gefunden" }, { status: 404 });
      }
      const updated = await base44.asServiceRole.entities.RoomMember.update(member.id, {
        status: action === "admit" ? "joined" : "blocked",
      });
      return Response.json({ member: updated });
    }

    if (event.host_email !== user.email && user.role !== "admin") {
      return Response.json({ error: "Nur der Host darf Rollen vergeben" }, { status: 403 });
    }

    if (!participantIdentity || !assignableRoles.includes(role)) {
      return Response.json({ error: "Ungültige Rollenänderung" }, { status: 400 });
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
