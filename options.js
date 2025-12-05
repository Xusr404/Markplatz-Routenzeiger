// content.js
// Rechte Splitscreen-Sidebar mit Start/Ziel-Feldern und OpenStreetMap-Route.

console.log("[Route-Addon] content.js wurde geladen");

(function () {
    if (window.__rhInitialized) {
        return;
    }
    window.__rhInitialized = true;

    const browserApi = (typeof browser !== "undefined")
        ? browser
        : (typeof chrome !== "undefined" ? chrome : null);

    function detectSite() {
        const host = location.hostname;
        if (host.includes("willhaben.at")) {
            return "willhaben";
        }
        if (host.includes("kleinanzeigen.de")) {
            return "kleinanzeigen";
        }
        return null;
    }

    function findWillhabenAddress() {
        let box = document.querySelector('[data-testid="top-contact-box-address-box"]');
        if (!box) {
            box = document.querySelector('[data-testid="bottom-contact-box-address-box"]');
        }
        if (box) {
            const parts = Array.from(box.querySelectorAll("span"))
                .map(s => s.textContent.trim())
                .filter(Boolean);
            if (parts.length) {
                return parts.join(", ") + ", Österreich";
            }
        }

        let span = document.querySelector('[data-testid="ad-detail-location"] span');
        if (!span) {
            span = document.querySelector(".Box-sc-wfmb7k-0.cVmHpR span, span.Text-sc-10o2fdq-0.gptVZX");
        }

        if (span && span.textContent.trim()) {
            return span.textContent.trim() + ", Österreich";
        }

        return null;
    }

    function findKleinanzeigenAddress() {
        const locality = document.querySelector("#viewad-locality[itemprop='addressLocality']");
        if (locality && locality.textContent.trim()) {
            return locality.textContent.replace(/\s+/g, " ").trim();
        }

        const listLoc = document.querySelector(".aditem-main--top--left");
        if (listLoc) {
            const textNode = Array.from(listLoc.childNodes).find(
                n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
            );
            if (textNode) {
                return textNode.textContent.trim();
            }
        }

        return null;
    }

    function getDestinationAddress(site) {
        if (site === "willhaben") return findWillhabenAddress();
        if (site === "kleinanzeigen") return findKleinanzeigenAddress();
        return null;
    }

    function createCollapsedToggle() {
        const toggle = document.createElement("div");
        toggle.id = "rh-panel-collapsed-toggle";
        toggle.textContent = "Route";
        toggle.addEventListener("click", () => {
            toggle.style.display = "none";
            document.body.classList.add("rh-route-helper-active");
            const panel = document.getElementById("rh-panel");
            if (panel) {
                panel.style.display = "flex";
            }
        });
        document.documentElement.appendChild(toggle);
        return toggle;
    }

    async function init() {
        const site = detectSite();
        if (!site) return;

        const destAddress = getDestinationAddress(site);

        const panel = document.createElement("div");
        panel.id = "rh-panel";
        panel.innerHTML = `
            <div id="rh-panel-header">
                <div id="rh-panel-title">Route zur Anzeige (OpenStreetMap)</div>
                <button id="rh-panel-toggle" title="Panel ausblenden">×</button>
            </div>
            <div id="rh-panel-form">
                <div class="rh-row">
                    <div class="rh-field">
                        <label class="rh-field-label" for="rh-start">Start</label>
                        <input class="rh-field-input" id="rh-start" type="text"
                               placeholder="Deine Heimatadresse">
                    </div>
                    <div class="rh-field">
                        <label class="rh-field-label" for="rh-destination">Ziel</label>
                        <input class="rh-field-input" id="rh-destination" type="text" readonly>
                    </div>
                </div>
                <div class="rh-row rh-row-bottom">
                    <button id="rh-btn-route">Route berechnen</button>
                    <div id="rh-panel-status"></div>
                </div>
            </div>
            <div id="rh-map-wrapper">
                <iframe id="rh-map-frame" title="Routenkarte"></iframe>
            </div>
        `;

        document.documentElement.appendChild(panel);
        document.body.classList.add("rh-route-helper-active");

        const collapsedToggle = createCollapsedToggle();

        const startInput = panel.querySelector("#rh-start");
        const destInput = panel.querySelector("#rh-destination");
        const statusEl = panel.querySelector("#rh-panel-status");
        const routeBtn = panel.querySelector("#rh-btn-route");
        const closeBtn = panel.querySelector("#rh-panel-toggle");
        const mapFrame = panel.querySelector("#rh-map-frame");

        if (destAddress && destInput) {
            destInput.value = destAddress;
        } else if (destInput) {
            destInput.value = "Ort nicht erkannt";
            routeBtn.disabled = true;
            statusEl.textContent = "Zieladresse konnte nicht automatisch erkannt werden.";
        }

        if (mapFrame) {
            const url = (browserApi && browserApi.runtime && browserApi.runtime.getURL)
                ? browserApi.runtime.getURL("map/map.html")
                : "map/map.html";
            mapFrame.src = url;
        }

        if (browserApi && browserApi.storage && browserApi.storage.local) {
            try {
                const res = await browserApi.storage.local.get("routeHelperHome");
                if (res && res.routeHelperHome && startInput) {
                    startInput.value = res.routeHelperHome;
                }
            } catch (e) {}
        }

        closeBtn.addEventListener("click", () => {
            document.body.classList.remove("rh-route-helper-active");
            panel.style.display = "none";
            collapsedToggle.style.display = "block";
        });

        routeBtn.addEventListener("click", () => {
            const start = startInput.value.trim();
            const dest = destInput.value.trim();

            if (!start) {
                statusEl.textContent = "Bitte zuerst deine Heimatadresse eingeben.";
                startInput.focus();
                return;
            }
            if (!dest || dest === "Ort nicht erkannt") {
                statusEl.textContent = "Zieladresse auf dieser Seite nicht verfügbar.";
                return;
            }

            statusEl.textContent = "Route wird berechnet …";

            if (browserApi && browserApi.storage && browserApi.storage.local) {
                browserApi.storage.local.set({ routeHelperHome: start });
            }

            if (mapFrame && mapFrame.contentWindow) {
                mapFrame.contentWindow.postMessage(
                    {
                        type: "ROUTE",
                        startAddress: start,
                        destAddress: dest
                    },
                    "*"
                );
            }
        });

        window.addEventListener("message", (event) => {
            if (!event.data || typeof event.data !== "object") return;
            if (event.data.type === "ROUTE_STATUS" && statusEl) {
                statusEl.textContent = event.data.message || "";
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

