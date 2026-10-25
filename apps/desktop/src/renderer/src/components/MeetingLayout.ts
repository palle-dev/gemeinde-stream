export interface MeetingStageCandidate {
  key: string;
  isScreenShare: boolean;
  isSpeaking: boolean;
}

export function selectMeetingStage<T extends MeetingStageCandidate>(tiles: T[], currentKey?: string): T | undefined {
  return tiles.find((tile) => tile.isScreenShare)
    ?? tiles.find((tile) => tile.isSpeaking)
    ?? tiles.find((tile) => tile.key === currentKey)
    ?? tiles[0];
}
