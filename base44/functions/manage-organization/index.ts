import { createClientFromRequest } from "npm:@base44/sdk";

const memberRoles = ["admin", "producer", "operator", "member"];

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json();
    const action = String(body.action ?? "get");
    const owned = await base44.asServiceRole.entities.Organization.filter({ owner_email: user.email, status: "active" });
    const links = await base44.asServiceRole.entities.OrganizationMember.filter({ email: user.email });
    let organization = owned[0] ?? (links[0] ? await base44.asServiceRole.entities.Organization.get(links[0].organization_id) : null);
    let actorRole = owned[0] ? "admin" : links[0]?.role;

    if (action === "save" && !organization) {
      const name = String(body.name ?? "").trim().slice(0, 120);
      if (!name) return Response.json({ error: "Bitte einen Gemeindenamen eingeben" }, { status: 400 });
      organization = await base44.asServiceRole.entities.Organization.create({ name, slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`, owner_email: user.email, status: "active", default_max_participants: 50, default_camera_on: true, default_microphone_on: true, default_waiting_room_enabled: true });
      await base44.asServiceRole.entities.OrganizationMember.create({ organization_id: organization.id, email: user.email, display_name: user.full_name || user.email, role: "admin", status: "active" });
      actorRole = "admin";
    }
    if (!organization) return Response.json({ organization: null, actorRole: null, members: [], devices: [] });
    if (organization.status !== "active" || (!actorRole && user.role !== "admin")) return Response.json({ error: "Kein Zugriff auf diese Gemeinde" }, { status: 403 });
    const canAdmin = actorRole === "admin" || user.role === "admin";

    if (action === "save" && organization) {
      if (!canAdmin) return Response.json({ error: "Nur Administratoren dürfen Einstellungen ändern" }, { status: 403 });
      const name = String(body.name ?? organization.name).trim().slice(0, 120);
      const maxParticipants = Math.round(Number(body.defaultMaxParticipants ?? organization.default_max_participants ?? 50));
      const streamServer = String(body.defaultStreamServer ?? "").trim().slice(0, 500);
      if (!name || maxParticipants < 2 || maxParticipants > 500 || (streamServer && !/^rtmps?:\/\//i.test(streamServer))) return Response.json({ error: "Gemeindeeinstellungen sind ungültig" }, { status: 400 });
      organization = await base44.asServiceRole.entities.Organization.update(organization.id, { name, default_max_participants: maxParticipants, default_camera_on: Boolean(body.defaultCameraOn), default_microphone_on: Boolean(body.defaultMicrophoneOn), default_waiting_room_enabled: Boolean(body.defaultWaitingRoomEnabled), default_stream_server: streamServer });
    }

    if (action === "invite") {
      if (!canAdmin) return Response.json({ error: "Nur Administratoren dürfen Teammitglieder einladen" }, { status: 403 });
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
      const displayName = String(body.displayName ?? email.split("@")[0]).trim().slice(0, 120);
      const role = String(body.role ?? "member");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || !memberRoles.includes(role)) return Response.json({ error: "Teammitglied ist ungültig" }, { status: 400 });
      const existing = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organization.id, email });
      const data = { organization_id: organization.id, email, display_name: displayName, role, status: existing[0]?.status === "active" ? "active" : "invited" };
      if (existing[0]) await base44.asServiceRole.entities.OrganizationMember.update(existing[0].id, data); else await base44.asServiceRole.entities.OrganizationMember.create(data);
    }

    if (action === "member-role" || action === "member-remove") {
      if (!canAdmin) return Response.json({ error: "Nur Administratoren dürfen Rollen verwalten" }, { status: 403 });
      const memberId = String(body.memberId ?? "");
      const member = memberId ? await base44.asServiceRole.entities.OrganizationMember.get(memberId) : null;
      if (!member || member.organization_id !== organization.id || member.email === organization.owner_email) return Response.json({ error: "Teammitglied kann nicht geändert werden" }, { status: 409 });
      if (action === "member-remove") await base44.asServiceRole.entities.OrganizationMember.delete(member.id);
      else {
        const role = String(body.role ?? "");
        if (!memberRoles.includes(role)) return Response.json({ error: "Rolle ist ungültig" }, { status: 400 });
        await base44.asServiceRole.entities.OrganizationMember.update(member.id, { role });
      }
    }

    if (action === "register-device") {
      const deviceId = String(body.deviceId ?? "").trim().slice(0, 100);
      const label = String(body.label ?? "Windows-PC").trim().slice(0, 120);
      const capabilities = Array.isArray(body.capabilities) ? body.capabilities.map(String).slice(0, 20) : [];
      if (!deviceId || !label) return Response.json({ error: "Gerätedaten sind unvollständig" }, { status: 400 });
      const existing = await base44.asServiceRole.entities.Device.filter({ device_id: deviceId, user_email: user.email });
      const data = { organization_id: organization.id, device_id: deviceId, user_email: user.email, label, platform: "windows", app_version: String(body.appVersion ?? ""), last_seen_at: new Date().toISOString(), capabilities, status: "online" };
      if (existing[0]) await base44.asServiceRole.entities.Device.update(existing[0].id, data); else await base44.asServiceRole.entities.Device.create(data);
      if (links[0]?.status === "invited") await base44.asServiceRole.entities.OrganizationMember.update(links[0].id, { status: "active" });
    }

    if (action === "device-status") {
      if (!canAdmin) return Response.json({ error: "Nur Administratoren dürfen Geräte verwalten" }, { status: 403 });
      const device = await base44.asServiceRole.entities.Device.get(String(body.deviceId ?? ""));
      const status = String(body.status ?? "");
      if (!device || device.organization_id !== organization.id || !["online", "offline", "disabled"].includes(status)) return Response.json({ error: "Geräteänderung ist ungültig" }, { status: 400 });
      await base44.asServiceRole.entities.Device.update(device.id, { status });
    }

    const members = await base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organization.id }, "display_name", 200, 0);
    const devices = await base44.asServiceRole.entities.Device.filter({ organization_id: organization.id }, "-last_seen_at", 200, 0);
    return Response.json({ organization, actorRole, members, devices });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
});
