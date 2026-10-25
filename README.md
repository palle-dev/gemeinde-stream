# Gemeinde Stream

Windows-Anwendung und Base44-Backend für zwei Betriebsarten:

- **Meeting:** interaktive Räume mit Kamera, Mikrofon und Bildschirmfreigabe
- **Broadcast:** rollenbasierte Master-Regie mit Vorschau, synchronisiertem Programmbild, Szenen und Remote-Quellen

In Live-Produktionen verteilt der Master jeden TAKE einschließlich Layout und Übergang an alle verbundenen Clients. Später beitretende Teilnehmer erhalten automatisch das aktuelle Programmbild; schalten dürfen nur Host, Co-Host und Operator.

Die Regie kann das aktuelle Programmbild als separates, bedienungsfreies 1080p60-Fenster öffnen. Es eignet sich für einen zweiten Bildschirm, Beamer, eine Capture-Karte oder als Fensterquelle in OBS; Layoutwechsel und TAKE werden unmittelbar übernommen.

Host, Co-Host und Operator können Quellenkombinationen als benannte Szenen speichern. Die Szenen liegen zentral in Base44, stehen der gesamten berechtigten Regie zur Verfügung und laden Layout sowie Kamera- oder Bildschirmquellen wieder in die Vorschau; erst `TAKE` schaltet sie sicher ins Programm.

Die Regie kann Bauchbinden mit Titel und Unterzeile vorbereiten. Die Vorschau zeigt den Entwurf; `TAKE` schaltet Bild und Einblendung synchron auf allen Regieplätzen. Die Grafik wird auch in das saubere Ausgabefenster, lokale Aufnahmen und RTMP-Streams eingebrannt.

Der Audiobereich der Live-Regie enthält einen echten lokalen Mixer für alle Remote-Mikrofone. Regie-Rollen sehen Live-Pegel, können Kanäle stummschalten und deren Wiedergabelautstärke für die Programmausgabe einstellen.

Ein Live-Signalmonitor zeigt für jede Kamera- und Bildschirmquelle die tatsächlich empfangene Auflösung, Bildrate, Videobitrate und LiveKit-Verbindungsqualität. Eine Ampel warnt die Regie sofort, wenn eine Quelle unter 1080p50 fällt oder die Verbindung instabil wird.

Das geschaltete Programm lässt sich direkt aus der Regie als 1080p60-WebM-Datei mit 12 Mbit/s aufnehmen. Die lokale Aufzeichnung folgt allen TAKE- und Layoutwechseln, mischt die verbundenen Mikrofonspuren und schreibt die Daten fortlaufend an den gewählten Speicherort, damit lange Gottesdienste nicht vollständig im Arbeitsspeicher gehalten werden.

Die Regie kann dasselbe Programmsignal außerdem direkt per RTMP oder RTMPS mit 1080p60, H.264/AAC und 8 Mbit/s an YouTube, Facebook oder einen eigenen Streaming-Server senden. Serveradresse und Stream-Schlüssel werden nur lokal an den Electron-Hauptprozess übergeben und nicht gespeichert. Die benötigte FFmpeg-Engine wird mit der Windows-Anwendung ausgeliefert; `GEMEINDE_STREAM_FFMPEG` kann sie bei Bedarf durch eine eigene Version ersetzen.

Vor dem Beitritt steht ein Vorraum mit Kameravorschau, Anzeigename sowie Auswahl von Kamera, Mikrofon und Lautsprecher bereit. Die persönlichen Geräte- und Ein/Aus-Einstellungen werden lokal für den nächsten Raum gespeichert.

Kamera, Mikrofon und Lautsprecher lassen sich auch während eines Meetings oder einer Live-Produktion über die Geräteeinstellungen wechseln. Neu angeschlossene Geräte werden erkannt, und die aktuelle Auswahl wird ohne Verlassen des Raums auf die laufenden LiveKit-Tracks angewendet.

In Meetings sehen alle Teilnehmer ihre Rollen. Host, Co-Host und Operator können untergeordnete Rollen stummschalten oder aus dem Raum entfernen; Host und gleichrangige Moderatoren sind vor unzulässigen Eingriffen geschützt.

Meetings bieten eine umschaltbare Galerie- und Sprecheransicht. Die Sprecheransicht stellt geteilte Bildschirme automatisch auf die große Bühne, folgt ansonsten dem aktiven Sprecher und zeigt alle weiteren Teilnehmer in einer horizontalen Filmleiste.

Der Host kann verbundene Teilnehmer im Meeting und in der Live-Regie zu Co-Host, Operator, Sprecher, Teilnehmer oder Zuschauer ernennen. Die Änderung wird im Backend gespeichert; der betroffene Client trennt sich automatisch und erhält beim erneuten Beitritt ein LiveKit-Token mit den neuen Rechten. Zuschauer können weder Kamera, Mikrofon noch Bildschirm veröffentlichen.

Beim Beitritt des Hosts wechselt eine geplante Veranstaltung auf „Live“. Der Host kann sie anschließend verbindlich für alle beenden; verbundene Clients verlassen den Raum automatisch und ein erneuter Beitritt wird serverseitig verhindert.

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
- Mitgliedschaften können nur über geprüfte Backend-Funktionen erstellt oder verändert werden; eine Selbst-Hochstufung über den direkten Entity-Zugriff ist gesperrt.
- Teilnehmer treten über die Backend-Funktion `join-room` bei.
- `get-room`, `create-livekit-token` und `manage-room-member` prüfen Mitgliedschaft und Host-Rechte serverseitig.
- LiveKit-Tokens laufen nach zehn Minuten ab; bestehende Verbindungen bleiben davon unberührt.
