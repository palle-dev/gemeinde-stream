export interface NormalizedBreakoutAssignment {
  participantIdentity: string;
  breakoutId: string;
  breakoutName: string;
}

export interface BreakoutMemberRecord {
  participant_identity?: unknown;
  role?: unknown;
  status?: unknown;
}

export function eligibleBreakoutIdentities(members: BreakoutMemberRecord[]): Set<string> {
  const identities = new Set<string>();
  for (const member of members) {
    const identity = typeof member.participant_identity === "string" ? member.participant_identity.trim() : "";
    const role = typeof member.role === "string" ? member.role : "participant";
    if (member.status === "joined" && identity && identity.length <= 200 && !["host", "cohost", "operator"].includes(role)) identities.add(identity);
  }
  return identities;
}

export function normalizeBreakoutAssignments(value: unknown, knownIdentities: Set<string>): NormalizedBreakoutAssignment[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) return null;
  const normalized: NormalizedBreakoutAssignment[] = [];
  const participantIdentities = new Set<string>();
  const roomNames = new Map<string, string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const entry = candidate as Record<string, unknown>;
    const participantIdentity = String(entry.participantIdentity ?? "").trim();
    const breakoutId = String(entry.breakoutId ?? "").trim();
    const breakoutName = String(entry.breakoutName ?? "").trim();
    if (!participantIdentity || participantIdentity.length > 200 || !knownIdentities.has(participantIdentity)
      || participantIdentities.has(participantIdentity)
      || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(breakoutId)
      || !breakoutName || breakoutName.length > 50 || /[\u0000-\u001f]/.test(breakoutName)
      || (roomNames.has(breakoutId) && roomNames.get(breakoutId) !== breakoutName)) return null;
    participantIdentities.add(participantIdentity);
    roomNames.set(breakoutId, breakoutName);
    normalized.push({ participantIdentity, breakoutId, breakoutName });
  }
  return roomNames.size <= 8 ? normalized : null;
}
