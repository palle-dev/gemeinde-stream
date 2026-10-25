export type TallyState = "on-air" | "standby";

export function broadcastTallyState(programSourceIds: string[], participantIdentity: string | undefined): TallyState {
  if (!participantIdentity) return "standby";
  const localPrefix = `${participantIdentity}-`;
  return programSourceIds.some((sourceId) => sourceId.startsWith(localPrefix)) ? "on-air" : "standby";
}
