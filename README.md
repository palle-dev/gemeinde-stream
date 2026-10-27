# Gemeinde Stream

Professionelles macOS- und Windows-Studio mit Base44-Backend für zwei Betriebsarten:

- **Meeting:** interaktive Räume mit Kamera, Mikrofon und Bildschirmfreigabe
- **Broadcast:** rollenbasierte Master-Regie mit Vorschau, synchronisiertem Programmbild, Szenen und Remote-Quellen

Hosts können Veranstaltungen mit Beschreibung, Startzeit, Teilnehmerlimit sowie Kamera- und Mikrofonvorgaben planen. Geplante und beendete Veranstaltungen lassen sich später bearbeiten oder vollständig löschen; das Backend bereinigt dabei zugehörige Mitgliedschaften und Szenen.

Teilnehmer können vorab per E-Mail-Adresse als Co-Host, Operator, Sprecher, Teilnehmer oder Zuschauer eingeladen werden. Der Raum erscheint im Dashboard des eingeladenen Kontos, und die vorab vergebene Rolle bleibt beim Beitritt erhalten. Ein fertiger Einladungstext mit Termin und Raumcode lässt sich für E-Mail oder Messenger kopieren.

Meetings können mit einem Warteraum geschützt werden. Nicht vorab eingeladene Personen bleiben dort ohne Medienzugriff, bis Host, Co-Host oder Operator sie zulassen; abgelehnte Zugänge werden für die Veranstaltung gesperrt. Eingeladene Personen gelangen weiterhin direkt in den Raum.

Während eines laufenden Meetings kann der Host den Raum zusätzlich sperren und wieder öffnen. Bei aktiver Sperre werden neue Personen bereits am Raumcode abgewiesen, während eingeladene oder zuvor zugelassene Teilnehmer ihre Verbindung wiederherstellen können.

Host, Co-Host und Operator können bei niedriger eingestuften Teilnehmern Mikrofon oder Kamera ausschalten. Entfernte Personen werden zusätzlich serverseitig blockiert und können dem Raum nicht erneut beitreten; Host und gleichrangige Moderatoren sind durch eine Backend-Prüfung geschützt.

Teilnehmer können mit 👍, ❤️, 🎉, 👏 oder 😂 reagieren. Die Reaktion wird über den LiveKit-Datenkanal verteilt, erscheint kurz über dem Kamerabild der Person und blendet sich anschließend automatisch aus.

In Live-Produktionen verteilt der Master jeden TAKE einschließlich Layout und Übergang an alle verbundenen Clients. Später beitretende Teilnehmer erhalten automatisch das aktuelle Programmbild; schalten dürfen nur Host, Co-Host und Operator.

Die Regie kann das aktuelle Programmbild als separates, bedienungsfreies 1080p60-Fenster öffnen. Es eignet sich für einen zweiten Bildschirm, Beamer, eine Capture-Karte oder als Fensterquelle in OBS; Layoutwechsel und TAKE werden unmittelbar übernommen.

Host, Co-Host und Operator können Quellenkombinationen als benannte Szenen speichern. Die Szenen liegen zentral in Base44, stehen der gesamten berechtigten Regie zur Verfügung und laden Layout sowie Kamera- oder Bildschirmquellen wieder in die Vorschau; erst `TAKE` schaltet sie sicher ins Programm.

Die Regie kann Bauchbinden mit Titel und Unterzeile vorbereiten. Die Vorschau zeigt den Entwurf; `TAKE` schaltet Bild und Einblendung synchron auf allen Regieplätzen. Die Grafik wird auch in das saubere Ausgabefenster, lokale Aufnahmen und RTMP-Streams eingebrannt.

Der Audiobereich der Live-Regie enthält einen echten lokalen Mixer für alle Remote-Mikrofone. Regie-Rollen sehen Live-Pegel, können Kanäle stummschalten und deren Wiedergabelautstärke für die Programmausgabe einstellen.

Ein Live-Signalmonitor zeigt für jede Kamera- und Bildschirmquelle die tatsächlich empfangene Auflösung, Bildrate, Videobitrate und LiveKit-Verbindungsqualität. Eine Ampel warnt die Regie sofort, wenn die Quelle das gewählte Produktionsprofil nicht zuverlässig erreicht oder die Verbindung instabil wird.

Für unterschiedliche Leitungen und Rechner stehen drei abgestimmte Produktionsprofile bereit: 720p30 effizient, 1080p30 Standard und 1080p60 Qualität. Das geschaltete Programm lässt sich direkt aus der Regie als WebM-Datei im gewählten Profil aufnehmen. Die lokale Aufzeichnung folgt allen TAKE- und Layoutwechseln, mischt die verbundenen Mikrofonspuren und schreibt die Daten fortlaufend an den gewählten Speicherort, damit lange Gottesdienste nicht vollständig im Arbeitsspeicher gehalten werden.

Die Regie kann dasselbe Programmsignal außerdem direkt per RTMP oder RTMPS mit H.264/AAC an bis zu fünf Ziele wie YouTube, Facebook oder einen eigenen Streaming-Server senden. Bitrate, Auflösung und Bildrate folgen dem Produktionsprofil. Serveradresse und Stream-Schlüssel werden nur lokal an den Electron-Hauptprozess übergeben und nicht gespeichert. Die benötigte FFmpeg-Engine wird mit der Desktop-Anwendung ausgeliefert; `GEMEINDE_STREAM_FFMPEG` kann sie bei Bedarf durch eine eigene Version ersetzen.

Ein Produktionscheck prüft vor Aufnahme und Ausspielung Programmbild, Quellen, Netzwerkstatus, FFmpeg, freien Speicher sowie die grundlegende Rechnerausstattung. Kritische Probleme blockieren den Start und werden mit einer konkreten Handlungsempfehlung angezeigt.

Vor dem Beitritt steht ein Vorraum mit Kameravorschau, Anzeigename sowie Auswahl von Kamera, Mikrofon und Lautsprecher bereit. Die persönlichen Geräte- und Ein/Aus-Einstellungen werden lokal für den nächsten Raum gespeichert.

Kamera, Mikrofon und Lautsprecher lassen sich auch während eines Meetings oder einer Live-Produktion über die Geräteeinstellungen wechseln. Neu angeschlossene Geräte werden erkannt, und die aktuelle Auswahl wird ohne Verlassen des Raums auf die laufenden LiveKit-Tracks angewendet.

In Meetings sehen alle Teilnehmer ihre Rollen. Host, Co-Host und Operator können untergeordnete Rollen stummschalten oder aus dem Raum entfernen; Host und gleichrangige Moderatoren sind vor unzulässigen Eingriffen geschützt.

Meetings bieten eine umschaltbare Galerie- und Sprecheransicht. Die Sprecheransicht stellt geteilte Bildschirme automatisch auf die große Bühne, folgt ansonsten dem aktiven Sprecher und zeigt alle weiteren Teilnehmer in einer horizontalen Filmleiste.

Host, Co-Host und Operator können auch normale Meetings lokal im gewählten Produktionsprofil als WebM-Datei aufzeichnen. Die Aufnahme übernimmt die aktuell gewählte Galerie- oder Sprecheransicht, priorisiert Bildschirmfreigaben und mischt die Mikrofone aller verbundenen Teilnehmer; die Daten werden fortlaufend an den gewählten Speicherort geschrieben.

Der Host kann verbundene Teilnehmer im Meeting und in der Live-Regie zu Co-Host, Operator, Sprecher, Teilnehmer oder Zuschauer ernennen. Die Änderung wird im Backend gespeichert; der betroffene Client trennt sich automatisch und erhält beim erneuten Beitritt ein LiveKit-Token mit den neuen Rechten. Zuschauer können weder Kamera, Mikrofon noch Bildschirm veröffentlichen.

Beim Beitritt des Hosts wechselt eine geplante Veranstaltung auf „Live“. Der Host kann sie anschließend verbindlich für alle beenden; verbundene Clients verlassen den Raum automatisch und ein erneuter Beitritt wird serverseitig verhindert.

## Projektstruktur

- `apps/desktop` – Electron-, React- und LiveKit-Client
- `base44/entities` – Räume, Mitgliedschaften, Geräte, Szenen und Organisationen
- `base44/functions` – sicherer Raumbeitritt, Raumabfrage und LiveKit-Tokenausgabe
- `infra/livekit` – Anleitung für den selbst gehosteten Produktionsserver
- `.github/workflows` – automatische Prüfungen, macOS-/Windows-Builds und signierte Releases

## Lokaler Start

```powershell
npm install
Copy-Item .env.example .env.local
# Zugangsdaten in .env.local eintragen
npm run dev:local
```

`dev:local` startet zuerst den lokalen LiveKit-Server und danach den Desktop-Client im Entwicklungsmodus. Die Zugangsdaten bleiben ausschließlich in der von Git ignorierten Datei `.env.local`.

### Entwicklung auf macOS

LiveKit muss einmalig mit Homebrew installiert werden (`brew install livekit`). Danach gelten dieselben npm-Befehle wie unter Windows; die Plattform wird automatisch erkannt.

```bash
npm ci
npm run electron:setup
cp .env.example .env.local
# LIVEKIT_API_KEY und LIVEKIT_API_SECRET durch eigene zufällige Werte ersetzen.
# Falls noch nicht vorhanden, auch die Desktop-Konfiguration anlegen:
cp apps/desktop/.env.example apps/desktop/.env.local
npm run livekit:setup
npm run dev:local
```

Seit Electron 42 wird die plattformspezifische Entwicklungs-Binärdatei aus
Sicherheitsgründen nicht mehr durch ein npm-`postinstall` geladen. `dev` und
`preview` führen den offiziellen On-Demand-Installer automatisch aus;
`npm run electron:setup` kann ihn vorab ausdrücklich starten.

Vorhandene `.env.local`-Dateien beibehalten. Der Mac-Server bindet ausschließlich an `127.0.0.1` und ist für Tests auf demselben Mac vorgesehen. Protokolle und Prozess-ID liegen im ignorierten Verzeichnis `work/`. `npm run livekit:smoke` prüft den authentifizierten Zugriff auf den Server; Kamera, Mikrofon und Bildschirmfreigabe müssen zusätzlich in der Anwendung geprüft werden. Für diesen Entwicklungsstart ist kein Mac-Installer erforderlich.

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

### Schutz laufender Produktionen

Während eine Aufnahme gespeichert wird oder ein RTMP-Stream aktiv ist, verhindert die Desktop-Anwendung das Schließen des Hauptfensters. Aufnahme und Streams müssen zuerst in der Oberfläche beendet werden.

Aufnahmedaten werden geordnet und auch bei Teilschreibvorgängen vollständig geschrieben. Beim Abschluss werden die Daten synchronisiert und die Datei geschlossen. Bei einem Fehler oder Absturz des Oberflächenprozesses bleiben bereits geschriebene Daten am gewählten Speicherort erhalten; nur leere abgebrochene Dateien werden entfernt. Das ersetzt kein Backup: Eine unterbrochene WebM-Datei kann eine Reparatur benötigen, und ein Absturz des gesamten Prozesses oder ein Stromausfall kann die letzten Daten verlieren.

Unterbrechungen der Medien- und Steuerverbindung werden getrennt angezeigt. LiveKit versucht die Verbindung automatisch wiederherzustellen; nach einer endgültigen Trennung bietet die Oberfläche einen erneuten Beitritt mit frisch angeforderten Zugangsdaten an.

### Automatische Prüfung

```powershell
npm run typecheck
npm test
npm run build
npm audit
npm run stream:smoke
```

Bei jedem Push auf `main` und bei Pull Requests führt GitHub Typprüfung, Tests und Build unter macOS sowie die Prüfungen und den Installer-Build unter Windows aus. Bei Pushes werden macOS-Pakete für Intel und Apple Silicon sowie der Windows-Installer 14 Tage als Build-Artefakte bereitgestellt. Ein Tag wie `v0.3.0` erzeugt nach erfolgreicher Code-Signatur und macOS-Notarisierung zusätzlich ein dauerhaftes GitHub-Release, sofern Tag und Paketversion übereinstimmen.

Unter **Einstellungen → Support & Diagnose** lässt sich ein Supportbericht mit Laufzeitdaten und den letzten maskierten Fehlerprotokollen exportieren. Zugangsdaten und RTMP-Stream-Schlüssel werden vor dem Schreiben entfernt.

Unter **Einstellungen → Softwareaktualisierung** prüft die Anwendung das
öffentliche GitHub-Release. Ein neuer Installer wird bewusst über die offizielle
Release-Seite ausgewählt, damit Intel-, Apple-Silicon- und Windows-Pakete nicht
verwechselt und laufende Produktionen nicht automatisch unterbrochen werden.

## Base44-Funktionen sicher veröffentlichen

Die lokalen Entity-Dateien sind keine vollständige Kopie einer bereits befüllten Base44-App. Ein vollständiges `base44 deploy` könnte deshalb bestehende Entitäten entfernen. Für dieses Projekt wird ausschließlich die geprüfte Funktionsliste veröffentlicht:

```bash
npm run base44:deploy:functions
```

Der Befehl verändert keine Entity-Schemas oder vorhandenen Datensätze.

## LiveKit konfigurieren

Der Base44-Funktion `create-livekit-token` müssen folgende Secrets bereitgestellt werden:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Danach erzeugt ausschließlich das Base44-Backend kurzlebige, rollenbasierte Raumtokens. Der API-Secret wird nie an die Windows-Anwendung ausgeliefert.

Die produktive Einrichtung mit öffentlicher Domain, TLS und TURN ist unter [`infra/livekit`](infra/livekit/README.md) dokumentiert.

Für Aufbau, Startreihenfolge, Störungsmaßnahmen und Nachbereitung einer echten
Übertragung gilt das [Produktions-Runbook](docs/PRODUCTION-RUNBOOK.md).
Der Ablauf für signierte, notarisierte Desktop-Pakete ist unter
[Signiertes Desktop-Release](docs/RELEASE.md) beschrieben.

## Sicherheitsmodell

- Räume sind standardmäßig privat.
- Direkter Entity-Zugriff ist per Row-Level Security auf Eigentümer bzw. den jeweiligen Benutzer beschränkt.
- Mitgliedschaften können nur über geprüfte Backend-Funktionen erstellt oder verändert werden; eine Selbst-Hochstufung über den direkten Entity-Zugriff ist gesperrt.
- Teilnehmer treten über die Backend-Funktion `join-room` bei.
- `get-room`, `create-livekit-token` und `manage-room-member` prüfen Mitgliedschaft und Host-Rechte serverseitig.
- LiveKit-Tokens laufen nach zehn Minuten ab; bestehende Verbindungen bleiben davon unberührt.
