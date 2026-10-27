import { open, unlink, type FileHandle } from "node:fs/promises";

interface Recording {
  handle: FileHandle;
  path: string;
  writes: Promise<void>;
  closing: boolean;
  bytesWritten: number;
  completion?: Promise<void>;
}

export interface BufferWriter {
  write(buffer: Buffer, offset: number, length: number, position: null): Promise<{ bytesWritten: number }>;
}

// A successful write is allowed to consume only part of a chunk.
export async function writeFully(writer: BufferWriter, buffer: Buffer, onWrite: (bytes: number) => void): Promise<void> {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await writer.write(buffer, offset, buffer.length - offset, null);
    if (bytesWritten <= 0) throw new Error("Die Aufnahmedatei konnte nicht weitergeschrieben werden.");
    offset += bytesWritten;
    onWrite(bytesWritten);
  }
}

export class RecordingStore {
  private readonly recordings = new Map<number, Recording>();

  has(senderId: number): boolean { return this.recordings.has(senderId); }

  async begin(senderId: number, path: string): Promise<void> {
    if (this.has(senderId)) throw new Error("Es läuft bereits eine Aufnahme.");
    const handle = await open(path, "w");
    this.recordings.set(senderId, { handle, path, writes: Promise.resolve(), closing: false, bytesWritten: 0 });
  }

  append(senderId: number, chunk: ArrayBuffer): Promise<void> {
    const recording = this.recordings.get(senderId);
    if (!recording || recording.closing) return Promise.reject(new Error("Keine aktive Aufnahmedatei."));
    const buffer = Buffer.from(chunk);
    const write = recording.writes.then(() => writeFully(recording.handle, buffer, (bytes) => { recording.bytesWritten += bytes; }));
    recording.writes = write;
    // Keep a rejected queue observable by finish(), without an unhandled rejection.
    void write.catch(() => undefined);
    return write;
  }

  finish(senderId: number): Promise<void> { return this.close(senderId, false); }

  // Cancellation and renderer crashes keep every byte already written. Only a
  // completely empty file is discarded; incomplete WebM files may need repair.
  preserve(senderId: number): Promise<void> { return this.close(senderId, true); }

  private close(senderId: number, removeEmpty: boolean): Promise<void> {
    const recording = this.recordings.get(senderId);
    if (!recording) return Promise.resolve();
    if (recording.completion) return recording.completion;
    recording.closing = true;
    recording.completion = (async () => {
      try {
        try { await recording.writes; }
        finally { await recording.handle.sync(); }
      } finally {
        try { await recording.handle.close(); }
        finally {
          this.recordings.delete(senderId);
          if (removeEmpty && recording.bytesWritten === 0) await unlink(recording.path);
        }
      }
    })();
    return recording.completion;
  }
}
