import { createClientFromRequest } from "npm:@base44/sdk";

const kinds = ["welcome", "music", "speech", "prayer", "media", "announcement", "other"];
const statuses = ["pending", "live", "done"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const action = String(body.action ?? "list");
    const event = eventId ? await base44.asServiceRole.entities.Event.get(eventId) : null;
    if (!event) return Response.json({ error: "Veranstaltung nicht gefunden" }, { status: 404 });
    const memberships = event.host_email === user.email || user.role === "admin" ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
    const role = event.host_email === user.email ? "host" : memberships[0]?.role;
    if (!role && user.role !== "admin") return Response.json({ error: "Kein Zugriff auf diesen Ablaufplan" }, { status: 403 });
    const canControl = user.role === "admin" || ["host", "cohost", "operator"].includes(String(role));
    const items = await base44.asServiceRole.entities.RundownItem.filter({ event_id: event.id }, "position", 200, 0);
    if (action === "list") return Response.json({ items });
    if (!canControl) return Response.json({ error: "Nur die Regie darf den Ablaufplan ändern" }, { status: 403 });
    if (action === "create") {
      const title = String(body.title ?? "").trim().slice(0, 120);
      const notes = String(body.notes ?? "").trim().slice(0, 1000);
      const kind = String(body.kind ?? "other");
      const durationSeconds = Math.round(Number(body.durationSeconds ?? 300));
      if (!title || !kinds.includes(kind) || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 14400) return Response.json({ error: "Programmpunkt ist ungültig" }, { status: 400 });
      const item = await base44.asServiceRole.entities.RundownItem.create({ event_id: event.id, title, notes, kind, duration_seconds: durationSeconds, position: items.length, status: "pending" });
      return Response.json({ item });
    }
    const itemId = String(body.itemId ?? "");
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return Response.json({ error: "Programmpunkt nicht gefunden" }, { status: 404 });
    if (action === "delete") {
      await base44.asServiceRole.entities.RundownItem.delete(item.id);
      const remaining = items.filter((candidate) => candidate.id !== item.id);
      await Promise.all(remaining.map((candidate, position) => candidate.position === position ? candidate : base44.asServiceRole.entities.RundownItem.update(candidate.id, { position })));
      return Response.json({ removed: true });
    }
    if (action === "move") {
      const direction = body.direction === "up" ? -1 : body.direction === "down" ? 1 : 0;
      const index = items.findIndex((candidate) => candidate.id === item.id);
      const targetIndex = index + direction;
      if (!direction || targetIndex < 0 || targetIndex >= items.length) return Response.json({ items });
      const target = items[targetIndex];
      await Promise.all([base44.asServiceRole.entities.RundownItem.update(item.id, { position: target.position }), base44.asServiceRole.entities.RundownItem.update(target.id, { position: item.position })]);
      const nextItems = [...items];
      [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
      return Response.json({ items: nextItems });
    }
    if (action === "status") {
      const status = String(body.status ?? "");
      if (!statuses.includes(status)) return Response.json({ error: "Status ist ungültig" }, { status: 400 });
      if (status === "live") await Promise.all(items.filter((candidate) => candidate.id !== item.id && candidate.status === "live").map((candidate) => base44.asServiceRole.entities.RundownItem.update(candidate.id, { status: "done" })));
      const updated = await base44.asServiceRole.entities.RundownItem.update(item.id, { status });
      return Response.json({ item: updated });
    }
    return Response.json({ error: "Unbekannte Ablaufplan-Aktion" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
