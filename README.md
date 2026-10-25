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
npm run dev
```

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
