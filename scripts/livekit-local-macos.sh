#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
project_root="$PWD"
pid_file="$project_root/work/livekit-macos.pid"
server_bin="$(command -v livekit-server || true)"

reachable() { nc -z -w 1 127.0.0.1 7880 >/dev/null 2>&1; }
managed() {
  [ -f "$pid_file" ] || return 1
  server_pid="$(<"$pid_file")"
  [[ "$server_pid" =~ ^[0-9]+$ ]] || return 1
  [ -n "$server_bin" ] || return 1
  local actual
  actual="$(ps -p "$server_pid" -o command= 2>/dev/null)" || return 1
  [ "$actual" = "$server_bin --bind 127.0.0.1 --node-ip 127.0.0.1 --rtc.enable_loopback_candidate" ]
}
case "${1:-Status}" in
  Setup)
    if [ -z "$server_bin" ]; then
      echo "LiveKit fehlt. Installieren Sie es mit: brew install livekit"
      exit 1
    fi
    "$server_bin" --version
    ;;
  Start)
    if [ -z "$server_bin" ]; then
      echo "LiveKit fehlt. Installieren Sie es mit: brew install livekit"
      exit 1
    fi
    if reachable; then
      if managed; then
        echo "LiveKit läuft bereits auf ws://localhost:7880 (PID $server_pid)."
        exit 0
      fi
      echo "Port 7880 ist durch einen anderen Prozess belegt."
      exit 1
    fi
    mkdir -p "$project_root/work"
    export LIVEKIT_KEYS="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"
    node --input-type=module - "$server_bin" "$project_root" <<'NODE'
import { spawn } from 'node:child_process';
import { openSync, closeSync, writeFileSync } from 'node:fs';
const [binary, root] = process.argv.slice(2);
const out = openSync(`${root}/work/livekit-stdout.log`, 'a', 0o600);
const err = openSync(`${root}/work/livekit-stderr.log`, 'a', 0o600);
const child = spawn(binary, ['--bind', '127.0.0.1', '--node-ip', '127.0.0.1', '--rtc.enable_loopback_candidate'], {
  detached: true, stdio: ['ignore', out, err], env: process.env,
});
child.on('error', () => { console.error('LiveKit-Prozess konnte nicht gestartet werden.'); process.exitCode = 1; });
child.on('spawn', () => { writeFileSync(`${root}/work/livekit-macos.pid`, `${child.pid}\n`, { mode: 0o600 }); child.unref(); });
closeSync(out);
closeSync(err);
NODE
    server_pid="$(<"$pid_file")"
    for ((attempt=0; attempt<20; attempt++)); do
      if reachable && managed; then
        echo "LiveKit läuft auf ws://localhost:7880 (PID $server_pid)."
        exit 0
      fi
      kill -0 "$server_pid" 2>/dev/null || break
      sleep 0.5
    done
    echo "LiveKit konnte nicht starten. Details: work/livekit-stderr.log"
    exit 1
    ;;
  Status)
    if managed && reachable; then
      echo "LiveKit läuft auf ws://localhost:7880 (PID $server_pid)."
    elif reachable; then
      echo "Port 7880 ist erreichbar, gehört aber nicht zum verwalteten Server."
    else
      echo "LiveKit ist nicht gestartet."
    fi
    ;;
  Stop)
    if managed; then
      kill "$server_pid"
      echo "LiveKit wird beendet (PID $server_pid)."
    elif reachable; then
      echo "Port 7880 gehört nicht zum verwalteten Server; der Prozess wird nicht beendet."
      exit 1
    else
      echo "LiveKit ist bereits beendet."
    fi
    ;;
  Smoke)
    node scripts/livekit-smoke.mjs
    ;;
esac
