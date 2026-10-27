# Produktions-Runbook für Gottesdienste

Dieses Runbook ist die verbindliche Kurzcheckliste für eine Live-Produktion mit
Gemeinde Stream. Es ergänzt die Prüfungen in der Anwendung und sollte vor der
ersten Produktion an die örtliche Technik angepasst werden.

## Rollen und Mindestbesetzung

- **Regie:** schaltet Vorschau, Programm, Szenen und Einblendungen.
- **Ton:** kontrolliert Mikrofone, Programmmischung und Übersteuerungen.
- **Technische Bereitschaft:** kennt Zugang zu Netzwerk, Streamingplattform und
  Ersatzaufzeichnung. Bei kleinen Produktionen dürfen Rollen zusammengelegt
  werden, die Zuständigkeit muss aber vor Beginn eindeutig sein.

## 60 Minuten vor Beginn

1. Produktionsrechner ans Netzteil anschließen und Energiesparmodus deaktivieren.
2. Möglichst kabelgebundenes Netzwerk verwenden; VPN und große Synchronisationen
   pausieren.
3. LiveKit prüfen:
   - lokal: `npm run livekit:status` und `npm run livekit:smoke`
   - öffentlich: Anmeldung und Beitritt von einem zweiten Netzwerk testen.
4. `npm run stream:smoke` ausführen, wenn FFmpeg oder der Rechner aktualisiert
   wurde.
5. In Gemeinde Stream die Veranstaltung öffnen und Kamera, Mikrofone,
   Bildschirmquellen und Lautsprecherausgabe einzeln prüfen.
6. Genügend freien Speicher für die lokale Aufnahme sicherstellen. Für einen
   Gottesdienst sollten mindestens 20 GB frei sein.

## 15 Minuten vor Beginn

1. Gewünschtes Produktionsprofil auswählen. Bei unsicherer Uploadreserve
   **1080p30 Standard** oder **720p30 Effizient** verwenden.
2. Jede Szene einmal in die Vorschau laden und mit `TAKE` probeweise schalten.
3. Bauchbinden auf Schreibweise, Zeilenlänge und Ausblendzustand prüfen.
4. Alle Audioquellen sprechen lassen; Pegel, Stummschaltungen und
   Programmmischung kontrollieren.
5. Privaten Teststream starten und Bild sowie Ton auf einem zweiten Gerät
   außerhalb des Produktionsrechners kontrollieren.
6. Teststream stoppen, Plattformstatus zurücksetzen und Produktionscheck erneut
   öffnen. Erst bei **Bereit für die Ausspielung** fortfahren.

## Live-Start

1. Lokale Programmaufnahme starten.
2. Streamingziele starten und auf den Zustand **VERBUNDEN** warten.
3. Auf der Zielplattform Vorschau und Ton kontrollieren.
4. Erst danach das Startbild mit `TAKE` ins Programm schalten.
5. Startzeit und Auffälligkeiten im Produktionsprotokoll notieren.

## Während der Übertragung

- Programm- und Vorschaufenster immer getrennt beobachten.
- Warnungen des Signalmonitors nicht ignorieren. Bei instabiler Quelle zunächst
  auf eine sichere Szene wechseln und erst danach die Ursache beheben.
- Streamstatus, Aufnahmezeit, freien Speicher und Plattformvorschau regelmäßig
  kontrollieren.
- Stream-Schlüssel niemals in Chat, E-Mail, Screenshots oder das
  Produktionsprotokoll kopieren.

## Störungsmaßnahmen

### Einzelne Kamera oder Bildschirmquelle fällt aus

1. Sofort eine sichere Szene oder das Einzelbild einer stabilen Quelle schalten.
2. Betroffene Quelle nicht wieder ins Programm nehmen, bevor der Signalmonitor
   stabile Werte zeigt.
3. Bei einer Remote-Quelle Verbindung neu aufbauen lassen; die übrige Produktion
   läuft weiter.

### Ein Streamingziel fällt aus

- Die anderen Ziele laufen unabhängig weiter.
- Fehlermeldung und Plattformstatus prüfen. Zugangsdaten nur direkt in Gemeinde
  Stream neu eingeben.
- Kein wiederholtes Starten in kurzer Folge; zuerst Erreichbarkeit und Schlüssel
  auf der Plattform prüfen.

### Alle Streamingziele fallen aus

1. Lokale Aufnahme weiterlaufen lassen.
2. Internetverbindung und Plattformstatus prüfen.
3. Streaming erst neu starten, wenn der Produktionscheck keine kritischen
   Netzwerk- oder FFmpeg-Fehler zeigt.
4. Falls eine Wiederherstellung nicht möglich ist, die lokale Aufnahme später
   veröffentlichen.

### Oberfläche oder Rechner fällt aus

- Gemeinde Stream neu starten und erneut beitreten. Der aktuelle Programmzustand
  wird bei öffentlichem LiveKit aus den Raummetadaten wiederhergestellt.
- Bereits geschriebene Aufnahmedaten bleiben am gewählten Speicherort erhalten;
  eine unterbrochene WebM-Datei kann eine Reparatur benötigen.
- Bei vollständigem Rechnerausfall auf den vorbereiteten Ersatzrechner wechseln.
  Stream-Schlüssel müssen dort erneut eingegeben werden, da sie bewusst nicht
  gespeichert werden.

## Geordnetes Ende

1. Abschlussbild schalten.
2. Alle Streamingziele stoppen und deren Ende auf der Plattform bestätigen.
3. Aufnahme stoppen und warten, bis **gespeichert** gemeldet wird.
4. Veranstaltung beenden und erst danach die Anwendung schließen.
5. Aufnahmedatei stichprobenartig abspielen und an den vorgesehenen
   Sicherungsort kopieren.
6. Unter **Einstellungen → Support & Diagnose** bei Auffälligkeiten einen
   Supportbericht exportieren.

## Regelmäßige Wartung

- Vor jedem Update einen kurzen Testgottesdienst mit zwei Clients durchführen.
- Monatlich Wiederanlauf, Ersatzrechner und lokalen Aufnahmeweg testen.
- Zugangsdaten nach Personalwechsel oder Verdacht auf Offenlegung rotieren.
- Produktive LiveKit-, Apple- und Windows-Zertifikate vor Ablauf erneuern.
- Nach Änderungen an Abhängigkeiten mindestens `npm run typecheck`, `npm test`,
  `npm run build`, `npm audit` und `npm run stream:smoke` ausführen.
