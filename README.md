# LAGEskizze

LAGEskizze is the adaption of an incident sketch which is used as a central draft of an accident, a fire, or a disaster in the Incident Management System of the federal state of North Rhine-Westphalia, Germany, ([Lagedarstellungssystem NRW](http://www.idf.nrw.de/service/downloads/downloads_lagedarstellungssystem_nrw.php)) delivered by the Institute of Fire Services NRW.

It is a javascript based position visualisation system that aims to support a consistent and structured management within fire brigade operations. It implements service regulations of the fire brigades in Germany conform to the Fire Service Regulation 100 (Feuerwehr-Dienstvorschrift 100).

The application is written using node.js and AngularJS. For desktop use in command support units, it is encapsulated in an easy to use Electron container. Most recent builds for Windows operation systems can be downloaded from the [EFTAS homepage](http://www.eftas.de/upload/LAGEskizze-win32-x64_10_11_2016.zip).

As base maps the recent version is using the open data WMS of the NRW-Atlas of the federal state NRW (ATKIS, ALKIS) - the relevant copyrights for the service are hold by the federal state. The tactical signs are conform to the German recommendation "Empfehlung für Taktische Zeichen im Bevölkerungsschutz" (Ständige Konferenz für Katastrophenvorsorge im Bevölkerungsschutz) of 2010.

**Credits**:
Base work was done by Saphir El-Kaiy (functional requirements and specification) and Sebastian Niklasch (first software implementation) in their bachelor thesis. The tactical signs where mostly drawn by Sebastian Ramrath, Fire Brigade Much.

## LAGEkarte für Stäbe

Im Ordner `src/public` liegt `kritis-lage.html`, eine eigenständige Lagekarte für einen operativ-taktischen Stab (Gebiete, KRITIS-Objekte, Kräfte, Abschnitte, Meldungen, Tagebuch, Lagestände, Wind und Keule). `python3 tools/build_offline.py` baut daraus die Einzeldatei `kritis-lage-einzeldatei.html`, die ohne weitere Dateien läuft. Kartenkacheln, Ortssuche und die Abfrage der KRITIS-Objekte brauchen Internet. Hinweise zur Live-Freigabe und zu den Lizenzen der Zeichen: `tools/README.md`, `src/public/images/LICENSES-symbole.md`.

### Bedienung im Stab

Die LAGEkarte kennt keine Funktionswahl mehr. Der S2 bedient das Programm und kann alles bearbeiten. Die anderen Funktionen arbeiten mit Meldungen und lassen sich vom S2 in die Karte eintragen. Die Lage lässt sich im Reiter Daten als JSON-Datei speichern und wieder einlesen.

Im Reiter Einheiten (Taste U) liegt die Stabswand: Kräfteübersicht mit Zahlen aus den Kacheln, Bereitstellungsräume, Einsatzabschnitte mit Kopfkarte, Aufträge, Ergänzungen (Wetter, Gefahrstoffraute) und Notizen mit der Betroffenentabelle. Kacheln lassen sich ziehen, Doppelklick oder A setzt „auf Anfahrt“. Die Wandoptik schaltet das Menü ein und aus.

## Gemeinsamer Einsatz und Beamer-Fenster

- **Beamer-Fenster:** Menü, "Beamer-Fenster". Einsatzübersicht, Führungsstruktur und Lagekarte laufen in eigenen Fenstern im selben Browser auf einem Rechner und folgen dem Hauptfenster. "Festhalten" friert Ausschnitt und Inhalte ein, die Taste H schaltet den Karten-Beamer um.
- **Gemeinsamer Einsatz:** Menü, "Gemeinsamer Einsatz". Mehrere Personen bearbeiten über einen Code denselben Einsatz, jede Änderung kommt nach ein, zwei Sekunden bei den anderen an. Dafür läuft ein eigener Server (`sync-server/`, Anleitung dort), die App liegt weiter auf GitHub Pages.

## Tests

Die Ende-zu-Ende-Tests liegen in `tests/run.js` und laufen mit Playwright gegen die gebaute Einzeldatei `src/public/kritis-lage-einzeldatei.html`:

    npm install
    npx playwright install chromium
    npm test

Geprüft werden unter anderem Start, Burger-Menü, Lagevortrag, alle Gefahrstoffe (keine Fehlertexte), die ERG-Distanzen für Chlor und Ammoniak, die Rechtsklick-Menüs, die Stabswand, Tastenkürzel, Einweisung, Fristen, Evakuierungsplanung und Rückgängig. Bei jedem Push startet dieselbe Prüfung über GitHub Actions (`.github/workflows/tests.yml`).

Nach Änderungen an `src/public/kritis-lage.html` muss die Einzeldatei neu gebaut werden (`python3 tools/build_offline.py`), sonst prüfen die Tests den alten Stand.
