export interface PollVoteRecord {
  voter_identity?: unknown;
  option_id?: unknown;
}

export interface PollDefinition {
  question: string;
  labels: string[];
}

export function activePollState<T extends { active?: unknown }>(states: T[]): T | null { return states.find((state) => state.active !== false) ?? null; }
export function archivedPollStates<T extends { active?: unknown }>(states: T[], limit = 100): T[] { return states.filter((state) => state.active === false).slice(0, Math.max(0, Math.min(100, Math.floor(limit)))); }

export function normalizePollDefinition(questionValue: unknown, optionsValue: unknown): PollDefinition {
  if (typeof questionValue !== "string") throw new Error("Die Umfragefrage ist ungültig");
  const question = questionValue.trim();
  if (!question || question.length > 200 || /[\u0000-\u001f\u007f]/.test(question)) throw new Error("Die Frage muss zwischen 1 und 200 Zeichen lang sein und darf keine Steuerzeichen enthalten");
  if (!Array.isArray(optionsValue) || optionsValue.length < 2 || optionsValue.length > 6) throw new Error("Es sind zwei bis sechs Antworten erforderlich");
  const labels = optionsValue.map((value) => {
    if (typeof value !== "string") throw new Error("Eine Antwort ist ungültig");
    const label = value.trim();
    if (!label || label.length > 100 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error("Antworten müssen zwischen 1 und 100 Zeichen lang sein und dürfen keine Steuerzeichen enthalten");
    return label;
  });
  const uniqueLabels = new Set(labels.map((label) => label.toLocaleLowerCase("de-DE")));
  if (uniqueLabels.size !== labels.length) throw new Error("Antworten dürfen nicht doppelt vorkommen");
  return { question, labels };
}

export function anonymousPollResults(votesNewestFirst: PollVoteRecord[], voterIdentity: string, allowedOptionIds?: Iterable<string>): { votes: Record<string, string>; selectedOptionId?: string } {
  const allowed = allowedOptionIds ? new Set(allowedOptionIds) : null;
  const seenVoters = new Set<string>();
  const accepted: Array<{ voterIdentity: string; optionId: string }> = [];
  for (const vote of votesNewestFirst) {
    const identity = typeof vote.voter_identity === "string" ? vote.voter_identity : "";
    const optionId = typeof vote.option_id === "string" ? vote.option_id : "";
    if (!identity || !optionId || seenVoters.has(identity) || (allowed && !allowed.has(optionId))) continue;
    seenVoters.add(identity);
    accepted.push({ voterIdentity: identity, optionId });
  }
  const anonymousVotes = Object.fromEntries(accepted.map((vote, index) => [`vote-${index + 1}`, vote.optionId]));
  const ownVote = accepted.find((vote) => vote.voterIdentity === voterIdentity);
  return { votes: anonymousVotes, ...(ownVote ? { selectedOptionId: ownVote.optionId } : {}) };
}

export function pollResultsForViewer(votesNewestFirst: PollVoteRecord[], voterIdentity: string, allowedOptionIds: Iterable<string>, revealTotals: boolean): { votes: Record<string, string>; selectedOptionId?: string } {
  const results = anonymousPollResults(votesNewestFirst, voterIdentity, allowedOptionIds);
  return revealTotals ? results : { votes: {}, ...(results.selectedOptionId ? { selectedOptionId: results.selectedOptionId } : {}) };
}
