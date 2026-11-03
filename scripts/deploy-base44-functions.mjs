import { spawnSync } from "node:child_process";

const appId = process.env.BASE44_APP_ID || "6ade1b54b52f50b9ad06e6ae";
const functions = [
  "create-livekit-token",
  "get-room",
  "join-room",
  "manage-room-member",
  "manage-broadcast-scenes",
  "manage-event",
  "manage-rundown",
  "manage-organization",
  "manage-program-state",
  "meeting-chat",
  "meeting-attendance",
  "meeting-notes",
  "meeting-files",
  "meeting-poll",
];

console.log(
  `Deploye ${functions.length} freigegebene Funktionen nach ${appId}. Entitätsschemata werden nicht verändert.`,
);
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npxCommand,
  [
    "--no-install",
    "base44",
    "--app-id",
    appId,
    "functions",
    "deploy",
    ...functions,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
