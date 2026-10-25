import { createClientFromRequest } from "npm:@base44/sdk";

const layouts = ["single", "side_by_side", "picture_in_picture"];
const trackSources = ["camera", "screen", "media"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const eventId = String(body.eventId ?? "");
    const action = String(body.action ?? "list");
    if (!eventId || !["list", "save", "delete"].includes(action)) {
      return Response.json({ error: "Ungültige Szenenanfrage" }, { status: 400 });
    }

    const event = await base44.asServiceRole.entities.Event.get(eventId);
    if (!event || event.mode !== "broadcast") {
      return Response.json({ error: "Live-Produktion nicht gefunden" }, { status: 404 });
    }

    const memberships = await base44.asServiceRole.entities.RoomMember.filter({
      event_id: event.id,
      user_email: user.email,
    });
    const role = event.host_email === user.email ? "host" : memberships[0]?.role;
    if (user.role !== "admin" && !["host", "cohost", "operator"].includes(String(role))) {
      return Response.json({ error: "Keine Berechtigung zur Szenensteuerung" }, { status: 403 });
    }

    if (action === "delete") {
      const sceneId = String(body.sceneId ?? "");
      const scene = sceneId ? await base44.asServiceRole.entities.Scene.get(sceneId) : null;
      if (!scene || scene.event_id !== event.id) {
        return Response.json({ error: "Szene nicht gefunden" }, { status: 404 });
      }
      await base44.asServiceRole.entities.Scene.delete(scene.id);
    }

    if (action === "save") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      const layout = String(body.layout ?? "");
      const requestedSlots = Array.isArray(body.sourceSlots) ? body.sourceSlots.slice(0, layout === "single" ? 1 : 2) : [];
      const sourceSlots = requestedSlots.map((slot: unknown, index: number) => {
        const value = slot as { participant_identity?: unknown; track_source?: unknown };
        return {
          slot: index + 1,
          participant_identity: String(value.participant_identity ?? "").slice(0, 200),
          track_source: String(value.track_source ?? ""),
        };
      });
      if (!name || !layouts.includes(layout) || sourceSlots.length === 0 || sourceSlots.some((slot) => !slot.participant_identity || !trackSources.includes(slot.track_source))) {
        return Response.json({ error: "Name, Layout oder Quellen der Szene sind ungültig" }, { status: 400 });
      }

      const sceneData = {
        event_id: event.id,
        owner_email: event.host_email,
        name,
        layout,
        source_slots: sourceSlots,
        is_program: false,
      };
      const sceneId = String(body.sceneId ?? "");
      if (sceneId) {
        const existing = await base44.asServiceRole.entities.Scene.get(sceneId);
        if (!existing || existing.event_id !== event.id) {
          return Response.json({ error: "Szene nicht gefunden" }, { status: 404 });
        }
        await base44.asServiceRole.entities.Scene.update(existing.id, sceneData);
      } else {
        await base44.asServiceRole.entities.Scene.create(sceneData);
      }
    }

    const scenes = await base44.asServiceRole.entities.Scene.filter({ event_id: event.id }, "created_date", 100, 0);
    return Response.json({ scenes });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
