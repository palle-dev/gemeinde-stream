# Öffentlicher LiveKit-Server

Dieses Verzeichnis beschreibt die produktive Medienserver-Installation für Gemeinde Stream. Verwendet wird der offizielle LiveKit-Generator. Er erzeugt Docker Compose, Redis, Caddy, automatisch verwaltete TLS-Zertifikate und TURN-Unterstützung.

## Voraussetzungen

- Linux-VM mit öffentlicher IPv4-Adresse, empfohlen Ubuntu 24.04 LTS
- eine eigene Domain
- zwei DNS-A-Records auf dieselbe Server-IP, zum Beispiel:
  - `video.gemeinde.de`
  - `turn.video.gemeinde.de`
- Docker auf dem Entwicklungsrechner, auf dem die Konfiguration erzeugt wird

## Konfiguration erzeugen

In PowerShell aus diesem Verzeichnis:

```powershell
New-Item -ItemType Directory -Force generated | Out-Null
Set-Location generated
docker pull livekit/generate
docker run --rm -it -v "${PWD}:/output" livekit/generate
```

Im Assistenten werden die Hauptdomain, die TURN-Domain, der Zielanbieter und optionale Dienste abgefragt. Für den ersten Produktivtest Ingress und Egress noch deaktiviert lassen. Die erzeugten Dateien bleiben wegen der enthaltenen Zugangsdaten von Git ausgeschlossen.

## DNS und Firewall

Vor dem ersten Serverstart müssen beide DNS-Namen auf die öffentliche IP zeigen. Eingehend freigeben:

| Port | Protokoll | Zweck |
| --- | --- | --- |
| 80 | TCP | Ausstellung der TLS-Zertifikate |
| 443 | TCP | HTTPS, WebSocket und TURN/TLS |
| 7881 | TCP | WebRTC-TCP-Fallback |
| 3478 | UDP | TURN über UDP |
| 50000–60000 | UDP | WebRTC-Medien |

## Installation auf der VM

Der Generator erstellt je nach gewähltem Anbieter eine Cloud-Init-Datei oder `init_script.sh`. Das Skript auf die VM kopieren und dort ausführen:

```bash
chmod +x init_script.sh
sudo ./init_script.sh
sudo systemctl status livekit-docker
```

Die Installation landet unter `/opt/livekit`. Logs lassen sich dort mit `sudo docker compose logs -f` anzeigen.

## Base44 umstellen

Nach erfolgreichem Serverstart werden in Base44 drei Secrets aktualisiert:

- `LIVEKIT_URL=wss://video.gemeinde.de`
- `LIVEKIT_API_KEY=<neu erzeugter Schlüssel>`
- `LIVEKIT_API_SECRET=<neu erzeugtes Geheimnis>`

Danach funktioniert derselbe Windows-Client standortübergreifend; eine neue Client-Version ist für den URL-Wechsel nicht erforderlich.

## Sicherheitsregeln

- Generierte Schlüssel niemals committen oder per E-Mail versenden.
- Für Produktion neue Schlüssel verwenden; keine lokalen Entwicklungsschlüssel übernehmen.
- SSH nur mit Schlüsseln erlauben und das Betriebssystem regelmäßig aktualisieren.
- Backups der erzeugten Konfiguration verschlüsselt außerhalb des Servers ablegen.

