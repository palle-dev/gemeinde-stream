# Abnahmeprotokoll für Produktionsfreigaben

Dieses Protokoll ist für jeden Release-Kandidaten vollständig auszufüllen. Ein
grüner CI-Lauf ersetzt keine reale Generalprobe. Zugangsdaten, Stream-Schlüssel,
Zertifikate und personenbezogene Inhalte gehören nicht in dieses Dokument oder
in angehängte Screenshots.

## Release-Kandidat

| Feld | Eintrag |
| --- | --- |
| Version und Git-Commit | |
| GitHub-Actions-Lauf | |
| Datum und verantwortliche Person | |
| Produktive LiveKit-Version und Region | |
| Streamingplattform und privates Testziel | |
| Ergebnis | ☐ Freigegeben ☐ Nicht freigegeben |

## Testsysteme

Für jedes verwendete Gerät Betriebssystem, Architektur, Netzwerkart sowie
Kamera-, Audio- und Bildschirmhardware notieren. Keine Seriennummern oder
Anmeldedaten erfassen.

| Kürzel | Betriebssystem / Architektur | Netzwerk | Rolle und Geräte |
| --- | --- | --- | --- |
| REGIE | | | |
| QUELLE-1 | | | |
| QUELLE-2 | | | |
| KONTROLLE | | | |

Mindestens ein Quellgerät muss sich in einem anderen Netzwerk als die Regie
befinden. Für die Installer-Abnahme werden ein frisches Windows-System, ein
Apple-Silicon-Mac und vor der öffentlichen Freigabe auch ein Intel-Mac benötigt.

## Automatische Nachweise

| Prüfung | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| CI vollständig grün | ☐ Bestanden ☐ Fehler | |
| 99 oder mehr Unit-/Integrationstests | ☐ Bestanden ☐ Fehler | |
| Lokaler RTMP-End-to-End-Test mit H.264/AAC | ☐ Bestanden ☐ Fehler | |
| Windows-Installer signiert | ☐ Bestanden ☐ Fehler | |
| macOS Intel signiert und notarisiert | ☐ Bestanden ☐ Fehler | |
| macOS Apple Silicon signiert und notarisiert | ☐ Bestanden ☐ Fehler | |
| Prüfsummen der Release-Dateien verifiziert | ☐ Bestanden ☐ Fehler | |

## Installation und Start

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Neuinstallation auf Windows | ☐ Bestanden ☐ Fehler | |
| Neuinstallation auf macOS Intel ohne Gatekeeper-Warnung | ☐ Bestanden ☐ Fehler | |
| Neuinstallation auf macOS Apple Silicon ohne Gatekeeper-Warnung | ☐ Bestanden ☐ Fehler | |
| Update von der vorherigen veröffentlichten Version | ☐ Bestanden ☐ Fehler | |
| Anmeldung, Abmeldung und erneute Anmeldung | ☐ Bestanden ☐ Fehler | |
| Kamera-, Mikrofon- und Bildschirmfreigaben verständlich | ☐ Bestanden ☐ Fehler | |
| App-Neustart erhält nur vorgesehene lokale Einstellungen | ☐ Bestanden ☐ Fehler | |

## Raum, Rollen und Sicherheit

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Veranstaltung planen, bearbeiten, einladen und löschen | ☐ Bestanden ☐ Fehler | |
| Beitritt über Raumcode und Einladungslink | ☐ Bestanden ☐ Fehler | |
| Warteraum: zulassen, ablehnen und erneuten Beitritt sperren | ☐ Bestanden ☐ Fehler | |
| Raum sperren und berechtigten Wiederbeitritt erlauben | ☐ Bestanden ☐ Fehler | |
| Rollenwechsel erzwingt korrektes Neuverbinden | ☐ Bestanden ☐ Fehler | |
| Zuschauer kann keine Medien veröffentlichen | ☐ Bestanden ☐ Fehler | |
| Niedrigere Rolle kann Host oder Operator nicht moderieren | ☐ Bestanden ☐ Fehler | |
| Entfernte Person kann nicht erneut beitreten | ☐ Bestanden ☐ Fehler | |
| Veranstaltung für alle beenden verhindert erneuten Beitritt | ☐ Bestanden ☐ Fehler | |
| Diagnoseexport enthält keine Zugangsdaten oder Stream-Schlüssel | ☐ Bestanden ☐ Fehler | |

## Geräte und Mehrgerätebetrieb

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Vorraum zeigt richtige Kamera und Geräteauswahl | ☐ Bestanden ☐ Fehler | |
| Kamera, Mikrofon und Lautsprecher während des Betriebs wechseln | ☐ Bestanden ☐ Fehler | |
| Bildschirmfreigabe starten, wechseln und beenden | ☐ Bestanden ☐ Fehler | |
| Verbindungsabbruch und automatischer Wiederanlauf | ☐ Bestanden ☐ Fehler | |
| Vollständiger Neustart und Wiederbeitritt mit frischem Token | ☐ Bestanden ☐ Fehler | |
| Zweites Netzwerk funktioniert über TLS und TURN | ☐ Bestanden ☐ Fehler | |
| 90-minütiger Test ohne Speicher-, Audio- oder Synchronitätsfehler | ☐ Bestanden ☐ Fehler | |

## Live-Regie

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Vorschau und Programm sind eindeutig getrennt | ☐ Bestanden ☐ Fehler | |
| TAKE, Schnitt und Überblende sind zwischen Regieplätzen synchron | ☐ Bestanden ☐ Fehler | |
| Später beitretender Regieplatz erhält den aktuellen Programmzustand | ☐ Bestanden ☐ Fehler | |
| Master-Wahl verhindert widersprüchliches Schalten | ☐ Bestanden ☐ Fehler | |
| Einzelbild, Nebeneinander und Bild-in-Bild korrekt | ☐ Bestanden ☐ Fehler | |
| Szenen speichern, laden, umordnen und löschen | ☐ Bestanden ☐ Fehler | |
| Bauchbinde vorbereiten, schalten und ausblenden | ☐ Bestanden ☐ Fehler | |
| Medienbibliothek und Gottesdienst-Ablauf funktionieren | ☐ Bestanden ☐ Fehler | |
| Sauberes Ausgabefenster folgt allen Schaltungen | ☐ Bestanden ☐ Fehler | |
| Tally zeigt Vorschau, Programm und Standby richtig | ☐ Bestanden ☐ Fehler | |
| Talkback erreicht nur das gewählte Ziel | ☐ Bestanden ☐ Fehler | |
| Signalmonitor meldet Auflösung, Bildrate, Bitrate und Qualität plausibel | ☐ Bestanden ☐ Fehler | |

## Audio, Aufnahme und Streaming

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Alle Remote-Mikrofone sind im Programmmixer hörbar | ☐ Bestanden ☐ Fehler | |
| Stummschaltung und Lautstärke wirken nur wie angezeigt | ☐ Bestanden ☐ Fehler | |
| Aufnahme enthält Bildwechsel, Einblendungen und gemischten Ton | ☐ Bestanden ☐ Fehler | |
| Aufnahme bleibt nach Renderer-Abbruch soweit möglich erhalten | ☐ Bestanden ☐ Fehler | |
| Privater RTMPS-Stream enthält korrektes H.264/AAC-Bild und Ton | ☐ Bestanden ☐ Fehler | |
| Zwei parallele Streamingziele laufen unabhängig | ☐ Bestanden ☐ Fehler | |
| Ausfall eines Ziels beendet weder anderes Ziel noch Aufnahme | ☐ Bestanden ☐ Fehler | |
| Neustart eines fehlgeschlagenen Ziels funktioniert geordnet | ☐ Bestanden ☐ Fehler | |
| Produktionscheck blockiert bei fehlendem Programm, Raum oder FFmpeg | ☐ Bestanden ☐ Fehler | |
| Freier Speicher und Schließen-Schutz funktionieren während der Aufnahme | ☐ Bestanden ☐ Fehler | |

## Nutzerführung und Darstellung

| Szenario | Ergebnis | Beleg / Anmerkung |
| --- | --- | --- |
| Kritische Aktionen verlangen eine verständliche Bestätigung | ☐ Bestanden ☐ Fehler | |
| Fehler nennen Ursache und konkrete nächste Handlung | ☐ Bestanden ☐ Fehler | |
| Tastaturbedienung und sichtbarer Fokus für zentrale Regieaktionen | ☐ Bestanden ☐ Fehler | |
| Keine abgeschnittenen Inhalte bei 100 % und 150 % Skalierung | ☐ Bestanden ☐ Fehler | |
| Kontrast, Statusfarben und Beschriftungen sind auch unter Zeitdruck eindeutig | ☐ Bestanden ☐ Fehler | |
| 1280×800 sowie 1920×1080 ohne unzugängliche Bedienelemente | ☐ Bestanden ☐ Fehler | |

## Abweichungen und Freigabe

Jeder Fehler erhält eine nachvollziehbare Referenz und wird vor der Freigabe
erneut geprüft. Ein offener Fehler in Anmeldung, Rollenprüfung, Medienverbindung,
Programmschaltung, Aufnahme, Streaming, Signierung oder Wiederanlauf blockiert
die Produktionsfreigabe.

| Referenz | Schweregrad | Beschreibung | Entscheidung / Nachtest |
| --- | --- | --- | --- |
| | | | |

| Freigabe | Name | Datum | Entscheidung |
| --- | --- | --- | --- |
| Technik | | | ☐ Ja ☐ Nein |
| Regie | | | ☐ Ja ☐ Nein |
| Verantwortliche Gemeinde | | | ☐ Ja ☐ Nein |

