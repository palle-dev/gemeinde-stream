# Signiertes Desktop-Release

Öffentliche Releases werden ausschließlich durch den Workflow
`.github/workflows/release.yml` erzeugt. Lokale, nicht signierte Pakete dienen
nur der Entwicklung und internen Prüfung.

## Einmalige Voraussetzungen

Unter **GitHub → Settings → Secrets and variables → Actions** werden folgende
Repository-Secrets angelegt:

| Secret | Inhalt |
| --- | --- |
| `WINDOWS_CERTIFICATE` | Base64-kodierte PFX/P12-Datei für Windows Code Signing |
| `WINDOWS_CERTIFICATE_PASSWORD` | Kennwort der Windows-Zertifikatsdatei |
| `MACOS_CERTIFICATE` | Base64-kodierte Developer-ID-Application-P12-Datei |
| `MACOS_CERTIFICATE_PASSWORD` | Kennwort der macOS-Zertifikatsdatei |
| `APPLE_ID` | Apple-ID des Developer-Kontos |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-spezifisches Apple-ID-Kennwort |
| `APPLE_TEAM_ID` | zehnstellige Apple Developer Team ID |

Zertifikate, Passwörter und Stream-Schlüssel niemals in Issues, Commits,
Workflowdateien oder Chatnachrichten einfügen.

## Release vorbereiten

1. `main` muss grün sein und darf keine lokalen Änderungen enthalten.
2. Versionsnummer in Root- und Desktop-`package.json` sowie `package-lock.json`
   konsistent erhöhen.
3. `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit` und
   `npm run stream:smoke` ausführen.
4. Einen internen Testgottesdienst nach
   [`PRODUCTION-RUNBOOK.md`](PRODUCTION-RUNBOOK.md) durchführen.
5. Die Ergebnisse im
   [`Abnahmeprotokoll`](ACCEPTANCE.md) festhalten. Eine nicht vollständig
   bestandene Abnahme blockiert die öffentliche Freigabe.
6. Änderungen committen und `main` erneut vollständig prüfen lassen.

## Release auslösen

Wenn die Paketversion beispielsweise `0.3.0` lautet:

```bash
git tag -a v0.3.0 -m "Gemeinde Stream 0.3.0"
git push origin v0.3.0
```

Der Workflow bricht sofort ab, wenn Tag und Paketversion nicht übereinstimmen.
Er baut Windows sowie macOS für Intel und Apple Silicon nativ.

## Automatische Freigabegates

Ein Release wird nur veröffentlicht, wenn alle folgenden Prüfungen erfolgreich
sind:

- Typprüfung, Unit-/Integrationstests und RTMP-End-to-End-Smoke-Test
- gültige Authenticode-Signatur des Windows-Installers
- strikte macOS-Code-Signaturprüfung
- Gatekeeper-Bewertung der macOS-App
- validiertes Apple-Notarisierungs-Ticket für App und DMG
- korrekte App-/FFmpeg-Architektur für Intel und Apple Silicon
- SHA-256-Prüfsummen für alle veröffentlichten Dateien

## Nach dem Release

1. Release-Seite öffnen und alle erwarteten Dateien sowie
   `SHA256SUMS.txt` prüfen.
2. Windows-Installer und das passende macOS-DMG auf frischen Testsystemen
   herunterladen und installieren.
3. Unter macOS kontrollieren, dass Gatekeeper keine Warnung zu einem unbekannten
   Entwickler zeigt.
4. Anmeldung, Gerätefreigaben, Raumbeitritt, Aufnahme und einen privaten
   RTMPS-Teststream auf beiden Betriebssystemen prüfen.
5. Das Abnahmeprotokoll abschließen und von Technik, Regie sowie der
   verantwortlichen Gemeinde freigeben lassen.
6. Erst danach die Version an das Produktionsteam verteilen.

Bei einem fehlgeschlagenen Gate wird kein GitHub-Release veröffentlicht. Fehler
werden behoben und mit einer neuen Versionsnummer beziehungsweise einem neuen Tag
erneut geprüft; veröffentlichte Tags werden nicht nachträglich verschoben.
