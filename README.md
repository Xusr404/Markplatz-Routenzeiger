# RouteHelper – Browser Extension (Firefox)
Eine Firefox-Erweiterung, die automatisch Entfernungen und Fahrzeiten zu Inseraten auf **willhaben.at** und **kleinanzeigen.de** berechnet.  
Die Extension blendet rechts ein modernes Split-View-Panel ein, zeigt eine interaktive OpenStreetMap-Karte mit Route an und berechnet Entfernung & Fahrzeit per OSRM-Routing.

---

## ✨ Funktionen

- Automatische Erkennung der Zieladresse direkt aus dem Inserat  
- Moderne „Split-Screen“-Routenanzeige
- Interaktive Karte mit OpenStreetMap / Leaflet
- Automatische Routenberechnung sobald Start & Ziel bekannt sind
- Permanentes Speichern der Heimatadresse (optional)
- Elegantes UI mit Frosted-Glass-Design
- Start/Ziel-Eingabe im Overlay über der Karte
- Entfernung (km) und Fahrzeit (Minuten) werden klar hervorgehoben
- Ein-/Ausklappbarer Panel-Button
- Saubere interne Architektur (content script → map iframe)

---

## 🔧 Installation (temporär – Developer Mode)

1. Zip-Datei herunterladen und **entpacken**  
2. Firefox öffnen  
3. `about:debugging` in die Adresszeile eingeben  
4. Links **“This Firefox”** / „Dieses Firefox“ auswählen  
5. Klick auf **„Temporäres Add-on laden…“**  
6. Die Datei **manifest.json** im entpackten Projektordner auswählen

Das Add-on erscheint nun in der Liste und ist aktiv.  
⚠ Hinweis: Temporäre Add-ons verschwinden nach einem Browser-Neustart.

---

## 🧭 Nutzung

1. `about:addons` öffnen → RouteHelper auswählen  
2. Heimatadresse eingeben (wird lokal gespeichert)  
3. Eine Anzeige auf **willhaben.at** oder **kleinanzeigen.de** öffnen  
4. Rechts erscheint automatisch das Panel mit Route, Entfernung & Fahrzeit  
5. Panel kann eingeklappt werden (Pfeil-Button am Rand)

---

## 🗂 Projektstruktur

