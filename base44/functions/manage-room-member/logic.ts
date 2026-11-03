const moderationRoleRank: Record<string, number> = {
  host: 3,
  cohost: 2,
  operator: 2,
  speaker: 1,
  participant: 1,
  viewer: 1,
};

export function memberCanModerate(actorRole: unknown, targetRole: unknown, administrator = false): boolean {
  if (administrator) return true;
  const actor = String(actorRole ?? "");
  const actorRank = moderationRoleRank[actor] ?? 0;
  const targetRank = moderationRoleRank[String(targetRole ?? "")] ?? Number.POSITIVE_INFINITY;
  return ["host", "cohost", "operator"].includes(actor) && actorRank > targetRank;
}

export function validParticipantIdentity(value: unknown): boolean {
  const identity = String(value ?? "");
  return identity.length >= 1
    && identity.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(identity);
}
