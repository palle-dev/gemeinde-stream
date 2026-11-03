# Änderungsprotokoll

## Unveröffentlicht

### Separater Meeting-Client

- Eigenständiges Produkt „Gemeinde Meeting“ für Windows, macOS Intel und Apple Silicon
- Eigene App-ID, eigenes Datenverzeichnis und Einladungsprotokoll `gemeinde-meeting://`
- Ausschließlich Meetingräume; Live-Regie und Broadcast-Räume sind konsequent ausgeblendet und gesperrt
- Getrennte Installer-Artefakte in CI und signierten GitHub-Releases

### Meeting-Zusammenarbeit

- Persistenter, serverseitig autorisierter Meeting-Chat mit Wiederherstellung nach Verbindungsabbrüchen und Löschfunktion
- Anwesenheitserfassung mit Beitrittszeiten, Dauer, Status und CSV-Export für Host, Co-Host und Operator
- Gemeinsame Meeting-Notizen mit automatischer Speicherung, Konfliktschutz, Versionshistorie und Markdown-Export
- Private Dateifreigabe bis 25 MB mit kurzlebigen Downloadlinks, geprüften Dateitypen und serverseitig autorisiertem Upload
- Gehärteter Dateiexport über den Electron-Hauptprozess mit Größen-, Dateinamen- und Erweiterungsprüfung

## 0.3.0 – Produktionsreife Live-Regie

### Live-Produktion

- Synchronisierte Master-Regie mit kontrollierter Übernahme, Szenen,
  Bauchbinden, Vorschau/Programm und separatem Ausgabefenster
- Mehrziel-RTMP/RTMPS-Ausspielung mit unabhängigem Zielstatus und begrenzten
  Warteschlangen
- Produktionsprofile für 720p30, 1080p30 und 1080p60
- Lokale Programm- und Meetingaufzeichnung mit fortlaufendem Dateischreiben
- Signalmonitor, Audiomixer, Talkback, Ablaufplan und Regie-Tastenkürzel
- Produktionscheck für Quellen, Programm, Netzwerk, FFmpeg, Speicher und Rechner

### Betrieb und Zuverlässigkeit

- Lokaler LiveKit-Betrieb unter macOS und Windows sowie sicherer Backend-Fallback
- Wiederverbindung, serverseitige Moderation und deterministische Regiesteuerung
- Schutz laufender Aufnahmen und Streams beim Schließen oder Renderer-Ausfall
- Maskierter Supportbericht mit Laufzeit- und Fehlerdiagnose
- Produktions- und Release-Runbooks

### Sicherheit und Releases

- Gehärtete Electron-Navigation, CSP, IPC-Absenderprüfung und isolierter Preload
- Rollenbasierte Tokens, Teilnehmerlimits und serverseitige Berechtigungsprüfung
- Native Pakete für Windows, macOS Intel und Apple Silicon
- Automatische Architektur-, RTMP-, Signatur-, Gatekeeper- und
  Notarisierungsprüfungen
- SHA-256-Prüfsummen für veröffentlichte Release-Artefakte

### Qualitätssicherung

- Automatisierte Typ-, Unit-, Integrations-, Build- und Abhängigkeitsprüfungen
- Lokaler RTMP-End-to-End-Smoke-Test mit erzeugtem Video- und Audiosignal
- Manuelle Abnahme von Anmeldung, Gerätevorraum, LiveKit-Beitritt, TAKE,
  Programmausgabe, Produktionscheck und Aufnahmeauswahl
