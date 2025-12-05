# RouteHelper – Browser Extension

RouteHelper blendet auf **willhaben.at** und **kleinanzeigen.de** ein kompaktes Routen-Panel ein, zeigt eine interaktive OpenStreetMap-Karte und berechnet Entfernung sowie Fahrzeit mit OSRM-Routing.

---

## Funktionen

- Zieladresse wird automatisch aus dem Inserat erkannt; sobald eine Startadresse vorliegt, erscheint sofort die Route.
- Split-Panel neben dem Inserat mit Eingaben für Start/Ziel, Karte, Marker und Strecke.
- Optional speicherbare Heimatadresse bleibt ausschließlich lokal im Browser.
- Panel-Schaltfläche lässt sich ein- und ausklappen, damit das Inserat nicht verdeckt bleibt.
- Entfernung (km) und Fahrzeit (d/h/min) werden klar lesbar angezeigt.

---

## Installation (temporär)

1. Dieses Repository herunterladen (z. B. über **Code → Download ZIP** oder `git clone`) und den Ordner bereit halten.
2. Browser-spezifische Schritte befolgen:

### Firefox
1. Firefox öffnen und `about:debugging` in die Adressleiste eingeben.
2. Im Abschnitt **Dieses Firefox / This Firefox** auf **Temporäres Add-on laden** klicken.
3. Die entpackte `manifest.json` auswählen.
4. Hinweis: Temporäre Add-ons verschwinden nach einem Browser-Neustart – bei Bedarf einfach erneut laden.

### Chrome / Chromium
1. Chrome öffnen und `chrome://extensions` aufrufen.
2. Rechts oben den **Entwicklermodus** aktivieren.
3. Auf **Entpackte Erweiterung laden** klicken und den Projektordner auswählen.
4. Solange RouteHelper nicht im Chrome Web Store verfügbar ist, müssen Updates manuell durch erneutes Laden erfolgen.

---

## Nutzung

1. RouteHelper über `about:addons` (Firefox) bzw. `chrome://extensions` (Chrome) aktivieren.
2. Beim ersten Start eine Heimatadresse oder beliebige Startadresse eingeben – sie bleibt nur lokal gespeichert.
3. Ein Inserat auf **willhaben.at** oder **kleinanzeigen.de** öffnen.
4. Das Panel erscheint rechts, zeigt Karte, Entfernung und Fahrzeit; über den Pfeil am Rand lässt es sich aus- und einklappen.

---

## Datenschutz & Technik

- Verwendet die WebExtension-APIs von Firefox sowie die Chromium Extension API.
- Karte basiert auf Leaflet mit OpenStreetMap-Kacheln.
- Routenberechnung erfolgt über den öffentlichen OSRM-Dienst; es werden keine eigenen Server verwendet.
- Die gespeicherte Heimatadresse bleibt vollständig im lokalen Browser-Speicher; sie wird nicht nach außen übertragen.