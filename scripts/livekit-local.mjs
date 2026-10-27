import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const action = process.argv[2] ?? "Status";
if (!["Setup", "Start", "Stop", "Status", "Smoke"].includes(action)) {
  throw new Error("Unbekannte LiveKit-Aktion.");
}
let command;
let args;
const env = { ...process.env };
if (process.platform === "win32") {
  command = "powershell";
  args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/livekit-local.ps1", action];
} else if (process.platform === "darwin") {
  if (["Start", "Smoke"].includes(action)) {
    const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(LIVEKIT_URL|LIVEKIT_API_KEY|LIVEKIT_API_SECRET)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    for (const name of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) {
      if (!env[name] || env[name] === "replace-me") throw new Error(`${name} fehlt in .env.local.`);
    }
    if (env.LIVEKIT_URL !== "ws://localhost:7880" && env.LIVEKIT_URL !== "ws://127.0.0.1:7880") {
      throw new Error("Der lokale Mac-Server erwartet LIVEKIT_URL=ws://localhost:7880.");
    }
  }
  command = "bash";
  args = ["scripts/livekit-local-macos.sh", action];
} else {
  throw new Error("Die lokale LiveKit-Verwaltung unterstützt Windows und macOS.");
}
const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
