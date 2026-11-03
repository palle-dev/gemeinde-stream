import { describe, expect, it } from "vitest";
import { meetingPollCsv, parsePollWire, pollCounts, pollTotal, safeMeetingPoll, safePollHistoryResponse, type MeetingPoll } from "./MeetingPolls";
import { activePollState, anonymousPollResults, archivedPollStates, normalizePollDefinition, pollResultsForViewer } from "../../../../../../base44/functions/meeting-poll/logic";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
describe("meeting polls", () => {
  it("validates poll messages", () => { expect(parsePollWire(encode({ type: "open", poll: { id: "p1", question: "Frage?", open: true, options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }] } }))).not.toBeNull(); expect(parsePollWire(encode({ type: "open", poll: { id: "p1", question: "", open: true, options: [] } }))).toBeNull(); expect(parsePollWire(encode({ type: "open", poll: { id: "p1", question: "Frage?", open: "yes", options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }] } }))).toBeNull(); });
  it("counts only known answer choices", () => { const poll: MeetingPoll = { id: "p", question: "?", open: true, showResultsWhileOpen: true, resultsVisible: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], votes: { one: "a", two: "a", three: "other" } }; expect(pollCounts(poll)).toEqual({ a: 2, b: 0 }); expect(pollTotal(poll)).toBe(2); });
  it("shares anonymous totals while returning only the caller's own selection", () => {
    const result = anonymousPollResults([
      { voter_identity: "person-2", option_id: "a" },
      { voter_identity: "person-1", option_id: "a" },
      { voter_identity: "person-2", option_id: "b" },
      { voter_identity: "person-3", option_id: "removed" },
    ], "person-2", ["a", "b"]);
    expect(result).toEqual({ votes: { "vote-1": "a", "vote-2": "a" }, selectedOptionId: "a" });
    expect(Object.keys(result.votes)).not.toContain("person-1");
    expect(Object.keys(result.votes)).not.toContain("person-2");
  });
  it("validates and normalizes poll definitions without silently truncating them", () => {
    expect(normalizePollDefinition("  Wohin?  ", ["  Links ", "Rechts"])).toEqual({ question: "Wohin?", labels: ["Links", "Rechts"] });
    expect(() => normalizePollDefinition("Wohin?", ["Ja", " ja "])).toThrow(/doppelt/);
    expect(() => normalizePollDefinition("Wohin?", ["Ja", "x".repeat(101)])).toThrow(/100/);
    expect(() => normalizePollDefinition("Wohin?\nJetzt", ["Ja", "Nein"])).toThrow(/Steuerzeichen/);
  });
  it("rejects synchronized results with unknown choices", () => {
    expect(parsePollWire(encode({ type: "sync", poll: { id: "p1", question: "Frage?", open: true, options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }], votes: { "vote-1": "other" } } }))).toBeNull();
  });
  it("uses a result refresh signal without exposing an answer", () => {
    expect(parsePollWire(encode({ type: "refresh", pollId: "p1" }))).toEqual({ type: "refresh", pollId: "p1" });
    expect(parsePollWire(encode({ type: "refresh", pollId: 123 }))).toBeNull();
  });
  it("never accepts vote totals over the peer synchronization channel", () => {
    expect(parsePollWire(encode({ type: "sync", poll: { id: "p1", question: "Frage?", open: true, options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }], votes: { "vote-1": "a" } } }))).toBeNull();
    expect(parsePollWire(encode({ type: "sync", poll: null }))).toEqual({ type: "sync", poll: null });
  });
  it("hides totals while preserving only the caller's own selection", () => {
    const votes = [{ voter_identity: "person-1", option_id: "a" }, { voter_identity: "person-2", option_id: "b" }];
    expect(pollResultsForViewer(votes, "person-1", ["a", "b"], false)).toEqual({ votes: {}, selectedOptionId: "a" });
    expect(Object.keys(pollResultsForViewer(votes, "person-1", ["a", "b"], true).votes)).toHaveLength(2);
  });
  it("strictly validates persisted poll responses", () => {
    const poll = { id: "poll-1", question: "Teilnehmen?", open: true, showResultsWhileOpen: false, resultsVisible: false, options: [{ id: "yes", label: "Ja" }, { id: "no", label: "Nein" }], votes: { "vote-1": "yes" }, selectedOptionId: "yes" };
    expect(safeMeetingPoll(poll)).toEqual(poll);
    expect(safeMeetingPoll(null)).toBeNull();
    expect(() => safeMeetingPoll({ ...poll, selectedOptionId: "unknown" })).toThrow();
    expect(() => safeMeetingPoll({ ...poll, votes: { "vote-1": "unknown" } })).toThrow();
    expect(() => safeMeetingPoll({ ...poll, options: [{ id: "yes", label: "Ja" }, { id: "yes", label: "Nein" }] })).toThrow();
  });
  it("exports anonymous results without exposing voter identities or spreadsheet formulas", () => {
    const poll: MeetingPoll = { id: "poll-1", question: "=Beschluss?", open: false, showResultsWhileOpen: false, resultsVisible: true, options: [{ id: "yes", label: "+Ja" }, { id: "no", label: "Nein" }], votes: { "anonymous-1": "yes", "anonymous-2": "yes", "anonymous-3": "no" }, selectedOptionId: "yes" };
    const csv = meetingPollCsv(poll);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\"'=Beschluss?\"");
    expect(csv).toContain("\"'+Ja\";\"2\";\"67\"");
    expect(csv).not.toContain("anonymous-1");
  });
  it("keeps one active poll while retaining bounded archived polls", () => {
    const states = [{ id: "current", active: true }, { id: "old", active: false }, { id: "legacy" }];
    expect(activePollState(states)?.id).toBe("current");
    expect(archivedPollStates(states).map((state) => state.id)).toEqual(["old"]);
    expect(archivedPollStates(states, 0)).toEqual([]);
  });
  it("strictly validates archived poll results", () => {
    const archived = { id: "old", question: "Frage?", open: false, showResultsWhileOpen: true, resultsVisible: true, options: [{ id: "yes", label: "Ja" }, { id: "no", label: "Nein" }], votes: { "vote-1": "yes" }, updatedAt: "2026-10-26T10:00:00.000Z" };
    expect(safePollHistoryResponse({ history: [archived] })).toEqual([archived]);
    expect(() => safePollHistoryResponse({ history: [{ ...archived, open: true }] })).toThrow();
    expect(() => safePollHistoryResponse({ history: new Array(101).fill(archived) })).toThrow();
  });
});
