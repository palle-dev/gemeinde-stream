import { Download, Subtitles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { meetingTranscriptText, type MeetingTranscriptEntry } from "./MeetingCaptions";

function safeTranscriptName(title: string): string {
  return title.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "-").trim() || "Meeting";
}

export function MeetingTranscript({ title, entries, onClear }: { title: string; entries: MeetingTranscriptEntry[]; onClear: () => void }) {
  const [message, setMessage] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries.length]);

  async function exportTranscript() {
    try {
      const saved = await window.desktop.saveTextFile(`${safeTranscriptName(title)}-Untertitel.txt`, meetingTranscriptText(title, entries), "txt");
      setMessage(saved ? "Untertitelprotokoll wurde gespeichert." : "Export wurde abgebrochen.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Untertitelprotokoll konnte nicht gespeichert werden.");
    }
  }

  function clearTranscript() {
    if (!entries.length || !window.confirm("Lokales Untertitelprotokoll wirklich leeren? Dieser Vorgang kann nicht rückgängig gemacht werden.")) return;
    onClear();
    setMessage("Lokales Untertitelprotokoll wurde geleert.");
  }

  return <div className="meeting-transcript">
    <div className="transcript-heading"><span><Subtitles /><b>Untertitelprotokoll</b></span><small>{entries.length} Zeile(n)</small></div>
    <p className="transcript-privacy">Das Protokoll bleibt lokal auf diesem PC. Audio wird dafür nicht hochgeladen.</p>
    <div className="transcript-actions"><button disabled={!entries.length} onClick={() => void exportTranscript()}><Download /> Exportieren</button><button disabled={!entries.length} onClick={clearTranscript}><Trash2 /> Leeren</button></div>
    <div className="transcript-lines" ref={listRef}>{entries.length ? entries.map((entry) => <div key={`${entry.senderIdentity}:${entry.id}`}><time>{new Date(entry.sentAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><b>{entry.senderName}</b><p>{entry.text}</p></div>) : <p className="side-empty">Noch keine gesprochenen Untertitel. Starten Sie die Untertitel im Teilnehmerbereich.</p>}</div>
    {message && <small className="transcript-message">{message}</small>}
  </div>;
}
