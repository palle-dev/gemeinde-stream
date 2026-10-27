import { createClientFromRequest } from "npm:@base44/sdk";
import { RoomServiceClient } from "npm:livekit-server-sdk";

const controllerRoles = ["host", "cohost", "operator"];
const layouts = ["single", "side_by_side", "picture_in_picture"];
const transitions = ["cut", "fade"];

function apiUrl(url: string) { return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"); }
function isLocalServer(url: string) { try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname); } catch { return false; } }
function role(metadata?: string) { try { return String(JSON.parse(metadata || "{}").role || ""); } catch { return ""; } }
function rank(value: string) { return value === "host" ? 0 : value === "cohost" ? 1 : value === "operator" ? 2 : 99; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json();
    const eventId = String(body.eventId || "");
    const action = String(body.action || "get");
    const event = eventId ? await base44.asServiceRole.entities.Event.get(eventId) : null;
    if (!event || event.mode !== "broadcast") return Response.json({ error: "Live-Produktion nicht gefunden" }, { status: 404 });
    const memberships = event.host_email === user.email || user.role === "admin" ? [] : await base44.asServiceRole.entities.RoomMember.filter({ event_id: event.id, user_email: user.email });
    const member = memberships[0];
    if (event.host_email !== user.email && user.role !== "admin" && !member) return Response.json({ error: "Kein Zugriff auf diese Produktion" }, { status: 403 });
    const apiKey = Deno.env.get("LIVEKIT_API_KEY"); const apiSecret = Deno.env.get("LIVEKIT_API_SECRET"); const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) return Response.json({ error: "LiveKit ist noch nicht konfiguriert" }, { status: 503 });
    const roomService = new RoomServiceClient(apiUrl(serverUrl), apiKey, apiSecret);
    if (isLocalServer(serverUrl)) {
      if (action === "get") return Response.json({ state: null, localMode: true });
      if (action === "save") return Response.json({ state: body.state, localMode: true });
      return Response.json({ error: "Ungültige Programmanfrage" }, { status: 400 });
    }
    const rooms = await roomService.listRooms([event.livekit_room_name]);
    let roomMetadata: Record<string, unknown> = {};
    try { roomMetadata = JSON.parse(rooms[0]?.metadata || "{}"); } catch { roomMetadata = {}; }
    if (action === "get") return Response.json({ state: roomMetadata.programState ?? null });
    if (action !== "save") return Response.json({ error: "Ungültige Programmanfrage" }, { status: 400 });

    const state = body.state as Record<string, unknown>;
    if (!state || state.type !== "program-state" || typeof state.revision !== "string" || typeof state.controllerIdentity !== "string" || typeof state.updatedAt !== "number" || !layouts.includes(String(state.layout)) || !transitions.includes(String(state.transition)) || !Array.isArray(state.sourceIds) || state.sourceIds.length > 2 || !state.sourceIds.every((id) => typeof id === "string")) {
      return Response.json({ error: "Ungültiger Programmzustand" }, { status: 400 });
    }
    const participants = await roomService.listParticipants(event.livekit_room_name);
    const controller = participants.filter((participant) => controllerRoles.includes(role(participant.metadata))).sort((left, right) => rank(role(left.metadata)) - rank(role(right.metadata)) || left.identity.localeCompare(right.identity))[0];
    if (!controller || controller.identity !== user.id || state.controllerIdentity !== user.id) return Response.json({ error: "Nur die aktive Regie darf das Programmbild schalten" }, { status: 409 });
    const metadata = JSON.stringify({ ...roomMetadata, programState: state });
    if (metadata.length > 15000) return Response.json({ error: "Der Programmzustand ist zu groß" }, { status: 413 });
    await roomService.updateRoomMetadata(event.livekit_room_name, metadata);
    return Response.json({ state });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
