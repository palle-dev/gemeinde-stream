import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingStore, writeFully } from "./recordings";

const directories: string[] = [];
async function recordingPath() {
  const directory = await mkdtemp(join(tmpdir(), "gemeinde-recording-test-"));
  directories.push(directory);
  return join(directory, "test.webm");
}
const chunk = (text: string) => new TextEncoder().encode(text).buffer;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("recording file integrity", () => {
  it("writes chunks in order and waits for queued data before finishing", async () => {
    const store = new RecordingStore();
    const path = await recordingPath();
    await store.begin(1, path);
    const first = store.append(1, chunk("first"));
    const second = store.append(1, chunk("second"));
    await store.finish(1);
    await Promise.all([first, second]);
    expect(await readFile(path, "utf8")).toBe("firstsecond");
    expect(store.has(1)).toBe(false);
    await expect(store.append(1, chunk("late"))).rejects.toThrow("Keine aktive");
  });

  it("keeps written data after cancellation or renderer failure", async () => {
    const store = new RecordingStore();
    const path = await recordingPath();
    await store.begin(2, path);
    const write = store.append(2, chunk("recoverable-video-data"));
    await store.preserve(2);
    await write;
    expect(await readFile(path, "utf8")).toBe("recoverable-video-data");
    await store.preserve(2); // destroyed can follow render-process-gone
    expect(store.has(2)).toBe(false);
  });

  it("removes only an empty cancelled file and isolates different windows", async () => {
    const store = new RecordingStore();
    const empty = await recordingPath();
    const active = await recordingPath();
    await store.begin(1, empty);
    await store.begin(2, active);
    await store.append(2, chunk("active"));
    await store.preserve(1);
    await expect(stat(empty)).rejects.toMatchObject({ code: "ENOENT" });
    expect(store.has(2)).toBe(true);
    await store.finish(2);
    expect(await readFile(active, "utf8")).toBe("active");
  });

  it("does not truncate a file when a second recording is requested", async () => {
    const store = new RecordingStore();
    const path = await recordingPath();
    await store.begin(1, path);
    await store.append(1, chunk("keep"));
    await expect(store.begin(1, path)).rejects.toThrow("bereits");
    await store.finish(1);
    expect(await readFile(path, "utf8")).toBe("keep");
  });

  it("retries partial writes without dropping bytes", async () => {
    const actual: Buffer[] = [];
    const writer = { write: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
      const bytesWritten = Math.min(2, length);
      actual.push(buffer.subarray(offset, offset + bytesWritten));
      return { bytesWritten };
    }) };
    const onWrite = vi.fn();
    await writeFully(writer, Buffer.from("abcdefg"), onWrite);
    expect(Buffer.concat(actual).toString()).toBe("abcdefg");
    expect(onWrite.mock.calls.flat().reduce((total, bytes) => total + bytes, 0)).toBe(7);
    expect(writer.write).toHaveBeenCalledTimes(4);
  });

  it("fails promptly on a stalled disk instead of spinning forever", async () => {
    const writer = { write: vi.fn(async () => ({ bytesWritten: 0 })) };
    await expect(writeFully(writer, Buffer.from("data"), () => undefined)).rejects.toThrow("weitergeschrieben");
    expect(writer.write).toHaveBeenCalledTimes(1);
  });

  it("propagates disk errors while reporting bytes that can be recovered", async () => {
    const diskFull = Object.assign(new Error("Disk full"), { code: "ENOSPC" });
    const writer = { write: vi.fn().mockResolvedValueOnce({ bytesWritten: 2 }).mockRejectedValueOnce(diskFull) };
    const onWrite = vi.fn();
    await expect(writeFully(writer, Buffer.from("data"), onWrite)).rejects.toMatchObject({ code: "ENOSPC" });
    expect(onWrite).toHaveBeenCalledWith(2);
  });
});
