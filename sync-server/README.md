# LAGEkarte Sync-Dienst (gemeinsamer Einsatz)

Kleiner Dienst für den **gemeinsamen Einsatz**: Mehrere Personen bearbeiten über einen Code denselben Einsatz.
Der Server speichert pro Einsatz nur **verschlüsselte** Änderungsblöcke und einen verschlüsselten Gesamtstand.
Kennung, Zugriffsschlüssel und Verschlüsselung entstehen in der App aus dem Code (HKDF-SHA256, AES-GCM-256). Es gibt keine Konten.
Läuft ohne zusätzliche Pakete auf Node 22. Aufgebaut wie der Sync-Dienst der BVI-Lernwebsite, mit eigenem Port und eigenen Pfaden.

## So arbeitet er
Die App liegt weiter auf GitHub Pages. Sie spricht über https mit diesem Server. Die Geräte holen Änderungen mit einer langen Abfrage ab
(bis zu 25 Sekunden, kommt eine Änderung, antwortet der Server sofort). Zusammengeführt wird **auf den Geräten, je Feld**:
Die spätere Änderung gewinnt, ein gelöschter Eintrag bleibt gelöscht. Zwei Personen, die verschiedene Dinge ändern, überschreiben sich nicht.

## Schnittstelle
| Aufruf | Zweck |
|---|---|
| `GET /health` | Lebenszeichen (`ok`) |
| `GET /v1/room/<id>/ops?since=N&wait=S&c=<Gerät>` | Änderungen seit N lesen, bei neuen Geräten auch den Gesamtstand; wartet bis zu S Sekunden |
| `POST /v1/room/<id>/ops` | Änderungsblock anhängen, legt den Einsatz an, wenn er neu ist |
| `PUT /v1/room/<id>/snapshot` | Gesamtstand ablegen, ersetzt alle Blöcke bis zur genannten Nummer |
| `DELETE /v1/room/<id>` | Einsatz löschen |

Die Kopfzeile `X-Sync-Token` ist bei jedem Aufruf nötig. Der Server speichert nur einen Hash davon.

## Einstellungen (Umgebungsvariablen)
`PORT` (8788), `DATA_DIR` (./data), `ALLOW_ORIGINS` (`https://flametan.github.io`, kommagetrennt, genau die Adresse der Seite),
`MAX_BODY` (12 MiB), `MAX_ROOMS` (500), `MAX_OPS` (4000), `RATE_PER_MIN` (600), `FAIL_PER_MIN` (10), `EXPIRE_DAYS` (60), `MAX_WAIT` (25),
`TRUST_PROXY` (`1` hinter einem Tunnel, damit die echte IP für die Begrenzung zählt).

## Auf dem Umbrel starten (eigener Container)
```
cd ~ && git clone https://github.com/Flametan/LAGEkarte.git
cd LAGEkarte/sync-server
sudo docker build -t lagekarte-sync .
sudo docker run -d --name lagekarte-sync --restart unless-stopped \
  -p 127.0.0.1:8788:8788 -v /home/umbrel/lagekarte-sync-data:/data \
  -e TRUST_PROXY=1 -e ALLOW_ORIGINS=https://flametan.github.io lagekarte-sync
sudo chown -R 1000:1000 /home/umbrel/lagekarte-sync-data
curl http://127.0.0.1:8788/health      # -> ok
```
Aktualisieren: `git pull`, neu bauen, `sudo docker rm -f lagekarte-sync` und den `docker run`-Befehl wiederholen. Die Daten bleiben im Datenordner.

## Von außen erreichbar machen (https)
Die Seite auf GitHub Pages läuft über https. Der Browser erlaubt ihr nur Verbindungen zu einem Server über https.
Der Server selbst spricht nur http, davor muss ein Tunnel oder Proxy mit Zertifikat. Ein Beispiel mit Tailscale Funnel
(**nicht getestet**, bitte auf dem eigenen Gerät ausprobieren): Funnel gibt es auf den Ports 443, 8443 und 10000. Läuft auf 443 schon der Sync-Dienst
der Lernwebsite, kann der Lagekarten-Dienst auf 8443 laufen:
```
sudo tailscale funnel --bg --https=8443 http://127.0.0.1:8788
```
Die Adresse lautet dann `https://<ihr-gerät>.<tailnet>.ts.net:8443`. Diese Adresse tragen Sie in der App unter
Menü, "Gemeinsamer Einsatz" im Feld "Server" ein. Der Befehl kann je nach Tailscale-Version anders lauten, die Hilfe `tailscale funnel --help` zeigt die aktuelle Form.
Alternativ funktionieren eine Domain mit Caddy oder Nginx als Proxy oder ein Cloudflare-Tunnel.

## Hinweise
- Wer den Code kennt, kann den Einsatz lesen und bearbeiten. Codes sind 20 Zeichen lang und nicht zu erraten. Weitergeben wie ein Passwort.
- Rückgängig (Strg+Z) ist im gemeinsamen Einsatz abgeschaltet, weil es sonst Änderungen der anderen zurücknehmen würde.
- Beim Beitritt wird der bisherige Stand auf dem Gerät automatisch als Datei gesichert.
- Ändern zwei Personen gleichzeitig dasselbe Feld, gilt die spätere Änderung.
- Sicherung des Servers: den Datenordner kopieren.

## Tests
`node --test sync-server/test/*.test.js`
