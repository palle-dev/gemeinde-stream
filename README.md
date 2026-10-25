# Gemeinde Stream

Windows-Anwendung und Base44-Backend für zwei Betriebsarten:

- **Meeting:** interaktive Räume mit Kamera, Mikrofon und Bildschirmfreigabe
- **Broadcast:** Master-Regie mit Vorschau, Programmbild, Szenen und externen Quellen

## Projektstruktur

- `apps/desktop` – Electron-, React- und LiveKit-Client
- `base44/entities` – Räume, Mitgliedschaften, Geräte, Szenen und Organisationen
- `base44/functions` – sicherer Raumbeitritt, Raumabfrage und LiveKit-Tokenausgabe
- `infra/livekit` – Anleitung für den selbst gehosteten Produktionsserver
- `.github/workflows` – automatische Prüfungen, Windows-Builds und Releases

## Lokaler Start

```powershell
npm install
Copy-Item .env.example .env.local
# Zugangsdaten in .env.local eintragen
npm run dev:local
```

`dev:local` startet zuerst den lokalen LiveKit-Server und danach den Windows-Client im Entwicklungsmodus. Die Zugangsdaten bleiben ausschließlich in der von Git ignorierten Datei `.env.local`.

Der Medienserver kann auch separat verwaltet und geprüft werden:

```powershell
npm run livekit:setup
npm run livekit:start
npm run livekit:status
npm run livekit:smoke
npm run livekit:stop
```

Beim ersten Start wird die geprüfte Windows-Version von LiveKit bei Bedarf automatisch heruntergeladen; `livekit:setup` kann dafür auch ausdrücklich aufgerufen werden.

Die lokale LiveKit-Adresse lautet `ws://localhost:7880`. Base44 muss während der lokalen Entwicklungsphase dieselbe URL und dieselben API-Zugangsdaten für `create-livekit-token` verwenden.

## Prüfungen

```powershell
npm run typecheck
npm test
npm run build
```

Bei jedem Push auf `main` führt GitHub dieselben Prüfungen auf einem Windows-Runner aus und stellt den Installer 14 Tage als Build-Artefakt bereit. Ein Tag wie `v0.2.0` erzeugt zusätzlich ein dauerhaftes GitHub-Release, sofern Tag und Paketversion übereinstimmen.

## LiveKit konfigurieren

Der Base44-Funktion `create-livekit-token` müssen folgende Secrets bereitgestellt werden:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Danach erzeugt ausschließlich das Base44-Backend kurzlebige, rollenbasierte Raumtokens. Der API-Secret wird nie an die Windows-Anwendung ausgeliefert.

Die produktive Einrichtung mit öffentlicher Domain, TLS und TURN ist unter [`infra/livekit`](infra/livekit/README.md) dokumentiert.

## Sicherheitsmodell

- Räume sind standardmäßig privat.
- Direkter Entity-Zugriff ist per Row-Level Security auf Eigentümer bzw. den jeweiligen Benutzer beschränkt.
- Teilnehmer treten über die Backend-Funktion `join-room` bei.
- `get-room` und `create-livekit-token` prüfen die Mitgliedschaft serverseitig.
- LiveKit-Tokens laufen nach zehn Minuten ab; bestehende Verbindungen bleiben davon unberührt.
