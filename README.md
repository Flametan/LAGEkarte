# LAGEkarte

Lagekarte für den operativ-taktischen Stab (FwDV 100, Sachgebiete S1 bis S6). Sie läuft im Browser, auf dem Rechner genauso wie auf dem Handy, und lässt sich auch als einzelne HTML-Datei ohne Installation verwenden.

**[Zur LAGEkarte: flametan.github.io/LAGEkarte](https://flametan.github.io/LAGEkarte/)**

Die Daten bleiben im Browser des Geräts. Kartenkacheln, Ortssuche und die Abfrage der KRITIS-Objekte brauchen Internet. Für das gemeinsame Bearbeiten eines Einsatzes braucht es zusätzlich einen eigenen Server, siehe unten.

## Was sie kann

Die Navigation links (auf dem Handy unten) führt durch die Bereiche. Die Knöpfe "+ EA", "+ Einsatzkräfte" und "+ Objekt" stehen oben rechts in der Kopfzeile.

- **Lagekarte** mit Einsatzabschnitten (EA), Untereinsatzabschnitten, Bereitstellungsräumen und Einsatzkräften als taktische Zeichen. Einheiten lassen sich auf der Karte in einen Abschnitt ziehen und werden ihm zugeordnet. Überdecken sich Zeichen, geht aus dem Abschnitt ein Strich zum Kartenrand, und die Einheiten stehen dort in einem Fenster. Aus diesem Fenster lassen sie sich auf die Karte zurückziehen.
- **Kräfte (Stabswand):** Kräfteübersicht, aufgeteilt nach Rot (Feuerwehr), Weiß (Rettungsdienst) und Blau (THW), Alarmiert und auf Marsch, Bereitstellungsräume, Einsatzabschnitte mit Kopfkarte, Aufträge, Wetter, Gefahrstoffraute und die Betroffenentabelle. Kacheln lassen sich ziehen, Doppelklick oder die Taste A setzt sie auf Anfahrt.
- **Führungsstruktur** nach FwDV 100: Einsatzleiter, Führungsstab, Leitstelle, Fachberater und Abschnitte mit Funkgruppen auf den Linien. Abschnitte lassen sich per Ziehen verschieben, Einheiten pro Abschnitt ausblenden.
- **Weitere Bereiche:** Einsatztagebuch, KRITIS-Ebenen, Objekte, Zahlen, Behandlungsplatz, Wetter und Keule, Gefahrstoffe mit Absperrzonen, Schadenslage und Datensicherung.
- **Beamer:** Der Knopf "Beamer" in der Kopfzeile öffnet ein Pult mit drei Kacheln: Einsatzübersicht, Führungsstruktur und Lagekarte. Jede Kachel zeigt eine Miniatur des Fensters und hat die Tasten ÖFFNEN, FESTHALTEN (oder FREIGEBEN) und AKTUAL. Die Fenster laufen im selben Browser auf einem Rechner und folgen dem Hauptfenster. Einsatzübersicht und Führungsstruktur passen sich automatisch der Größe des Schirms an, damit alles ohne Scrollen sichtbar ist. Strg und Minus, Plus, Null gelten nur für das jeweilige Fenster. Taste H hält den Karten-Beamer fest.
- **Handy:** Navigation unten, Seitenleiste als Blatt über der Karte. Der Rechner bleibt unverändert, die Seite ist nicht für das Handy zuerst gebaut.

## Gemeinsamer Einsatz

Menü oben rechts, "Gemeinsamer Einsatz". "Teilen" legt den Einsatz verschlüsselt auf dem Server ab und gibt einen Code aus. Wer den Code unter "Beitreten" eingibt, arbeitet am selben Einsatz mit. Änderungen kommen nach ein bis zwei Sekunden bei den anderen an, auch wenn zwei Personen gleichzeitig verschiedene Dinge ändern.

**Nur ansehen:** Im selben Dialog erzeugt "QR-Code zum Ansehen" einen QR-Code und einen Link. Wer ihn öffnet, sieht den Einsatz live, kann aber nichts ändern, und es wird auf dem Gerät nichts gespeichert. Der Zugang zum Ansehen enthält kein Schreibrecht, der Server weist Änderungen mit dem Lesezugang ab.

Der Server liegt im Ordner [`sync-server`](sync-server/README.md). Er speichert nur verschlüsselte Daten, die Schlüssel entstehen im Browser aus dem Code. Die Anleitung zum Einrichten mit Docker steht dort. Die Adresse des Servers ist in der Seite voreingestellt (im Dialog unter "Server" änderbar). Wer die LAGEkarte selbst betreibt, trägt dort die eigene Adresse ein und ändert die Voreinstellung im Quelltext (`SYNC_SERVER` in `src/public/kritis-lage.html`).

Rückgängig (Strg+Z) ist im gemeinsamen Einsatz abgeschaltet, weil es sonst Änderungen der anderen zurücknehmen würde.

## Einzeldatei und Veröffentlichung

Quelle ist `src/public/kritis-lage.html`. `python3 tools/build_offline.py` baut daraus die Einzeldatei `src/public/kritis-lage-einzeldatei.html`, die ohne weitere Dateien läuft. Beim Bauen wird Internet gebraucht. Ein Push auf `main` veröffentlicht die Einzeldatei über GitHub Pages (`.github/workflows/pages.yml`).

Hinweise zur Live-Freigabe im lokalen Netz und zu den Lizenzen der Zeichen: `tools/README.md`, `src/public/images/LICENSES-symbole.md`.

## Tests

Die Ende-zu-Ende-Tests liegen in `tests/run.js` und laufen mit Playwright gegen die gebaute Einzeldatei `src/public/kritis-lage-einzeldatei.html`:

    npm install
    npx playwright install chromium
    npm test

Geprüft werden unter anderem Start, Burger-Menü, Lagevortrag, alle Gefahrstoffe (keine Fehlertexte), die ERG-Distanzen für Chlor und Ammoniak, die Rechtsklick-Menüs, die Stabswand, Tastenkürzel, Einweisung, Fristen, Evakuierungsplanung und Rückgängig. Bei jedem Push startet dieselbe Prüfung über GitHub Actions (`.github/workflows/tests.yml`).

Nach Änderungen an `src/public/kritis-lage.html` muss die Einzeldatei neu gebaut werden (`python3 tools/build_offline.py`), sonst prüfen die Tests den alten Stand.

## Herkunft und Lizenzen

Die LAGEkarte baut auf LAGEskizze auf, einer Lagedarstellung für den Einsatz der Feuerwehr in Nordrhein-Westfalen (Lagedarstellungssystem NRW, Institut der Feuerwehr NRW). Die Taktischen Zeichen entsprechen der "Empfehlung für Taktische Zeichen im Bevölkerungsschutz" (Ständige Konferenz für Katastrophenvorsorge im Bevölkerungsschutz, 2010).

**Credits**:
Base work was done by Saphir El-Kaiy (functional requirements and specification) and Sebastian Niklasch (first software implementation) in their bachelor thesis. The tactical signs where mostly drawn by Sebastian Ramrath, Fire Brigade Much.

Lizenz: MIT, siehe `LICENSE`. Die Lizenzen der Zeichen stehen in `src/public/images/LICENSES-symbole.md`.
