// content.js
// Fügt ein rechtes Panel ein und kommuniziert mit map.html (Leaflet + OSM/OSRM).

(function () {
  if (window.__rhInitialized) return;
  window.__rhInitialized = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY_HOME = "routeHelperHome";
  const SESSION_KEY_COLLAPSED = "rhCollapsed";
  const AUTOCOMPLETE_MIN_CHARS = 3;
  const AUTOCOMPLETE_DELAY = 250;
  const NOMINATIM_AUTOCOMPLETE_URL = "https://nominatim.openstreetmap.org/search";
  const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
  let mapFrame = null;
  let mapReady = false;
  let mapInitialized = false;   // neu: ob die map.html bereits geladen wurde
  let mapPageUrl = null;        // wird zur Laufzeit gesetzt

  let pendingRoute = null;
  let currentSite = null;
  let currentDestFromDom = null;
  let currentDestCanonical = null;
  let destManuallyEdited = false;
  let preferredCountryCode = null;
  let geolocationRequested = false;

  // -------------------- Site-Erkennung --------------------

  function detectSite() {
    const host = location.hostname;
    if (host.includes("willhaben.at")) return "willhaben";
    if (host.includes("kleinanzeigen.de")) return "kleinanzeigen";
    return null;
  }

  // -------------------- Adress-Erkennung --------------------

    function findWillhabenAddress() {
      let box = document.querySelector('[data-testid="top-contact-box-address-box"]');
      if (!box) {
        box = document.querySelector('[data-testid="bottom-contact-box-address-box"]');
      }
      if (box) {
        const parts = Array.from(box.querySelectorAll("span"))
          .map((s) => safeTextContent(s))
          .filter(Boolean);
        if (parts.length) {
          const address = buildWillhabenAddress(parts);
          if (address) {
            return address;
          }
        }
      }
      let span = document.querySelector('[data-testid="ad-detail-location"] span');
      if (!span) {
        span = document.querySelector(".Box-sc-wfmb7k-0.cVmHpR span, span.Text-sc-10o2fdq-0.gptVZX");
      }
      const spanText = safeTextContent(span);
      if (spanText) {
        const address = buildWillhabenAddress([spanText]);
        if (address) {
          return address;
        }
      }
      return null;
    }

  function buildWillhabenAddress(parts) {
    const normalized = normalizeWillhabenTokens(parts);
    if (!normalized.length) return null;
    const text = normalized.join(", ");
    if (!text) return null;
    if (/österreich/i.test(text)) {
      return text;
    }
    return `${text}, Österreich`;
  }

  function normalizeWillhabenTokens(parts) {
    const tokens = [];
    const source = Array.isArray(parts) ? parts : [parts];
    source.forEach((part) => {
      if (!part || typeof part !== "string") return;
      part
        .split(",")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .forEach((chunk) => tokens.push(chunk));
    });

    if (!tokens.length) return [];

    const bezirkIndex = tokens.findIndex((token) => /bezirk/i.test(token));
    const postalIndex = tokens.findIndex((token) => /^\d{4}\s+\S+/i.test(token));

    if (bezirkIndex >= 0 && postalIndex >= 0) {
      const candidateIndex = bezirkIndex + 1;
      const candidate =
        candidateIndex < tokens.length && !/bezirk/i.test(tokens[candidateIndex])
          ? tokens[candidateIndex]
          : null;
      const normalized = [];
      const used = new Set([bezirkIndex]);

      if (candidate && !/\d/.test(candidate)) {
        normalized.push(candidate);
        used.add(candidateIndex);
      }

      normalized.push(tokens[postalIndex]);
      used.add(postalIndex);

      tokens.forEach((token, idx) => {
        if (used.has(idx)) return;
        normalized.push(token);
      });

      return normalized;
    }

    return tokens;
  }

  function safeTextContent(node) {
    if (!node) return "";
    if (typeof node.textContent === "string") {
      return node.textContent.trim();
    }
    return "";
  }

  function canonicalAddress(value) {
    if (!value || typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().toLowerCase();
  }

  function normalizeKleinanzeigenAddress(raw) {
    if (!raw) {
      return null;
    }
    let text = raw.replace(/\s+/g, " ").trim();
    const m = text.match(/^(\d{4,5})\s+(.+?)\s*-\s*(.+)$/);
    if (m) {
      const plz = m[1];
      const region = m[2];
      const ort = m[3];
      return `${plz} ${ort}, ${region}, Deutschland`;
    }
    if (!/Deutschland/i.test(text)) {
      text += ", Deutschland";
    }
    return text;
  }

  function findKleinanzeigenAddress() {
    const locality = document.querySelector("#viewad-locality[itemprop='addressLocality']");
    const localityText = safeTextContent(locality);
    if (localityText) {
      return normalizeKleinanzeigenAddress(localityText);
    }
    const listLoc = document.querySelector(".aditem-main--top--left");
    if (listLoc) {
      const textNode = Array.from(listLoc.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && safeTextContent(n)
      );
      if (textNode) {
        return normalizeKleinanzeigenAddress(textNode.textContent);
      }
    }
    return null;
  }

  function getDestinationAddress(site) {
    let result = null;
    if (site === "willhaben") result = findWillhabenAddress();
    if (site === "kleinanzeigen") result = findKleinanzeigenAddress();
    return result;
  }

  function setDestFromDom(destInput, value) {
    if (!destInput) return;
    destInput.value = value || "";
    destManuallyEdited = false;
    destInput.dataset.source = "dom";
  }

  function markDestManual(destInput) {
    destManuallyEdited = true;
    if (destInput) {
      destInput.dataset.source = "manual";
    }
  }

  function updateResetButtonState(destInput, button) {
    if (!button) return;
    const hasDomValue = Boolean(currentDestFromDom);
    const inputValue = destInput ? destInput.value.trim() : "";
    const domValue = currentDestFromDom ? currentDestFromDom.trim() : "";
    const differs =
      hasDomValue && canonicalAddress(inputValue) !== canonicalAddress(domValue);
    const shouldShow = differs;
    button.disabled = !shouldShow;
    if (shouldShow) {
      button.classList.add("rh-input-reset--visible");
      button.style.display = "inline-flex";
    } else {
      button.classList.remove("rh-input-reset--visible");
      button.style.display = "none";
    }
  }

  // -------------------- Panel-Aufbau --------------------

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "rh-panel";

    panel.innerHTML = `
      <div id="rh-map-wrapper">
        <iframe id="rh-map-frame" title="Routenkarte"></iframe>

        <div id="rh-overlay">
          <div class="rh-field">
            <div class="rh-field-label">Start</div>
            <div class="rh-input-row">
              <span class="rh-input-icon">📍</span>
              <input id="rh-start" class="rh-input" type="text" placeholder="Deine Heimatadresse" />
            </div>
          </div>

          <div class="rh-field">
            <div class="rh-field-label">Ziel</div>
            <div class="rh-input-row rh-input-row--dest">
              <span class="rh-input-icon">🎯</span>
              <input id="rh-destination" class="rh-input" type="text" placeholder="Adresse der Anzeige" />
              <button id="rh-destination-reset" type="button" class="rh-input-reset" title="Adresse vom Inserat wiederherstellen">&#8635;</button>
            </div>
          </div>

          <div id="rh-panel-status"></div>
        </div>
      </div>

      <button id="rh-panel-close">❱</button>
    `;

    document.documentElement.appendChild(panel);
    document.body.style.marginRight = "34vw";
    document.body.style.transition = "margin-right 0.2s ease";

    return panel;
  }

  function createCollapsedToggle() {
    const toggle = document.createElement("div");
    toggle.id = "rh-panel-collapsed-toggle";
    toggle.textContent = "❰ Route";

    toggle.addEventListener("click", () => {
      // wieder ausklappen
      sessionStorage.setItem(SESSION_KEY_COLLAPSED, "0");
      toggle.style.display = "none";
      document.body.style.marginRight = "34vw";
      const panel = document.getElementById("rh-panel");
      if (panel) panel.style.display = "flex";

      // Map iframe bei Bedarf erst jetzt laden
      if (!mapInitialized && mapFrame && mapPageUrl) {
        mapReady = false;
        mapFrame.src = mapPageUrl;
      } else if (mapFrame && mapFrame.contentWindow) {
        // Map existiert schon – nur Resize
        setTimeout(() => {
          try {
            mapFrame.contentWindow.postMessage({ type: "RESIZE" }, "*");
          } catch {
            // ignorieren
          }
        }, 100);
      }
    });

    document.documentElement.appendChild(toggle);
    return toggle;
  }

  // -------------------- Routing-Anfrage --------------------

  function requestRoute(start, dest) {
    if (!start || !dest) {
      return;
    }

    const payload = {
      type: "ROUTE",
      startAddress: start,
      destAddress: dest
    };

    pendingRoute = payload;

    if (mapReady && mapFrame && mapFrame.contentWindow) {
      mapFrame.contentWindow.postMessage(payload, "*");
    }
  }

  // -------------------- Ergebnis-Rendering --------------------

  function renderRouteStatus(statusElement, message) {
    if (!message.startsWith("Entfernung:")) {
      statusElement.textContent = message;
      return;
    }

    const cleaned = message.replace(/^Entfernung:\s*/, "");
    const parts = cleaned.split("–");
    const distText = (parts[0] || "").trim();
    const timeTextRaw = (parts[1] || "").trim();
    const timeText = timeTextRaw.replace(/^Fahrzeit\s*/i, "").trim();

    statusElement.innerHTML = "";

    const result = document.createElement("div");
    result.className = "rh-result";

    const row = document.createElement("div");
    row.className = "rh-result-row";

    // Entfernung
    const colDistance = document.createElement("div");
    colDistance.className = "rh-result-col";

    const labelDistance = document.createElement("div");
    labelDistance.className = "rh-result-label";
    labelDistance.textContent = "Entfernung";

    const valueDistance = document.createElement("div");
    valueDistance.className = "rh-result-value";

    const iconDistance = document.createElement("span");
    iconDistance.className = "rh-result-icon rh-result-icon-distance";
    iconDistance.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="#e5e7eb" d="M6.5 8.11c-.89 0-1.61-.72-1.61-1.61A1.61 1.61 0 0 1 6.5 4.89c.89 0 1.61.72 1.61 1.61A1.61 1.61 0 0 1 6.5 8.11M6.5 2C4 2 2 4 2 6.5c0 3.37 4.5 8.36 4.5 8.36S11 9.87 11 6.5C11 4 9 2 6.5 2m11 6.11a1.61 1.61 0 0 1-1.61-1.61a1.609 1.609 0 1 1 3.22 0a1.61 1.61 0 0 1-1.61 1.61m0-6.11C15 2 13 4 13 6.5c0 3.37 4.5 8.36 4.5 8.36S22 9.87 22 6.5C22 4 20 2 17.5 2m0 14c-1.27 0-2.4.8-2.82 2H9.32a3 3 0 0 0-3.82-1.83A3.003 3.003 0 0 0 3.66 20a3.017 3.017 0 0 0 3.84 1.83c.85-.3 1.5-.98 1.82-1.83h5.37c.55 1.56 2.27 2.38 3.81 1.83A3 3 0 0 0 20.35 18c-.43-1.2-1.57-2-2.85-2m0 4.5A1.5 1.5 0 0 1 16 19a1.5 1.5 0 0 1 1.5-1.5A1.5 1.5 0 0 1 19 19a1.5 1.5 0 0 1-1.5 1.5Z"/></svg>';

    const textDistance = document.createElement("span");
    textDistance.className = "rh-result-text-distance";
    textDistance.textContent = distText;

    valueDistance.appendChild(iconDistance);
    valueDistance.appendChild(textDistance);
    colDistance.appendChild(labelDistance);
    colDistance.appendChild(valueDistance);

    // Divider
    const divider = document.createElement("div");
    divider.className = "rh-result-divider";

    // Fahrzeit
    const colTime = document.createElement("div");
    colTime.className = "rh-result-col";

    const labelTime = document.createElement("div");
    labelTime.className = "rh-result-label";
    labelTime.textContent = "Fahrzeit";

    const valueTime = document.createElement("div");
    valueTime.className = "rh-result-value";

    const iconTime = document.createElement("span");
    iconTime.className = "rh-result-icon rh-result-icon-time";
    iconTime.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="#e5e7eb" d="M12 20a8 8 0 0 0 8-8a8 8 0 0 0-8-8a8 8 0 0 0-8 8a8 8 0 0 0 8 8m0-18a10 10 0 0 1 10 10a10 10 0 0 1-10 10C6.47 22 2 17.5 2 12A10 10 0 0 1 12 2m.5 5v5.25l4.5 2.67l-.75 1.23L11 13V7h1.5Z"/></svg>';

    const textTime = document.createElement("span");
    textTime.className = "rh-result-text-time";
    textTime.textContent = timeText;

    valueTime.appendChild(iconTime);
    valueTime.appendChild(textTime);
    colTime.appendChild(labelTime);
    colTime.appendChild(valueTime);

    row.appendChild(colDistance);
    row.appendChild(divider);
    row.appendChild(colTime);
    result.appendChild(row);

    statusElement.appendChild(result);
  }

  // -------------------- Init-Logik --------------------

  async function init() {
    currentSite = detectSite();
    if (!currentSite) {
      return;
    }
    initPreferredCountry();

    const destAddress = getDestinationAddress(currentSite);
    currentDestFromDom = destAddress || null;
    const initialCanonical = canonicalAddress(currentDestFromDom);
    currentDestCanonical = initialCanonical || null;

    const panel = createPanel();
    const collapsedToggle = createCollapsedToggle();

    const startInput = panel.querySelector("#rh-start");
    const destInput = panel.querySelector("#rh-destination");
    const destResetBtn = panel.querySelector("#rh-destination-reset");
    const statusEl = panel.querySelector("#rh-panel-status");
    const closeBtn = panel.querySelector("#rh-panel-close");

    if (closeBtn) {
      closeBtn.style.position = "absolute";
      closeBtn.style.top = "50%";
      closeBtn.style.left = "-14px";
      closeBtn.style.transform = "translateY(-50%)";
      closeBtn.style.background = "rgba(17, 24, 39, 0.95)";
      closeBtn.style.boxShadow = "-4px 6px 16px rgba(15, 23, 42, 0.7)";
      closeBtn.style.borderRadius = "8px 0 0 8px";
      closeBtn.style.width = "22px";
      closeBtn.style.height = "42px";
      closeBtn.style.display = "flex";
      closeBtn.style.alignItems = "center";
      closeBtn.style.justifyContent = "center";
      closeBtn.style.color = "#e5e7eb";
      closeBtn.style.fontSize = "14px";
    }
    mapFrame = panel.querySelector("#rh-map-frame");
    mapPageUrl = api.runtime.getURL("map/map.html");

    let suggestionBox = null;
    let suggestionItems = [];
    let suggestionIndex = -1;
    let suggestionFetchTimeout = null;
    let suggestionAbortController = null;
    let suggestionRequestId = 0;

    if (startInput) {
      const startField = startInput.closest(".rh-field");
      if (startField) {
        suggestionBox = document.createElement("div");
        suggestionBox.className = "rh-suggestions";
        startField.appendChild(suggestionBox);
      }
    }

    // Start-Zustand: eingeklappt oder offen? (pro Tab, via sessionStorage)
    const wasCollapsed = sessionStorage.getItem(SESSION_KEY_COLLAPSED) === "1";
    if (wasCollapsed) {
      panel.style.display = "none";
      collapsedToggle.style.display = "flex";
      document.body.style.marginRight = "0";
      // WICHTIG: map.html hier NICHT laden → wird erst beim Aufklappen geladen
    } else {
      collapsedToggle.style.display = "none";
      document.body.style.marginRight = "34vw";
      if (mapFrame && mapPageUrl) {
        mapFrame.src = mapPageUrl;
        mapInitialized = true;
      }
    }

    // Zieladresse setzen
    if (destInput) {
      if (destAddress) {
        setDestFromDom(destInput, destAddress);
        const canonical = canonicalAddress(destAddress);
        currentDestCanonical = canonical || null;
      } else {
        setDestFromDom(destInput, "Ort nicht erkannt");
        statusEl.textContent = "Zieladresse konnte nicht automatisch erkannt werden.";
        currentDestCanonical = null;
      }
      updateResetButtonState(destInput, destResetBtn);
    }

    if (destResetBtn) {
      destResetBtn.addEventListener("click", () => {
        if (currentDestFromDom) {
          setDestFromDom(destInput, currentDestFromDom);
          const canonical = canonicalAddress(currentDestFromDom);
          currentDestCanonical = canonical || null;
          updateResetButtonState(destInput, destResetBtn);
          statusEl.textContent = "Zieladresse auf Inserat zurückgesetzt.";
          maybeAutoRoute();
        } else {
          statusEl.textContent = "Keine Inseratsadresse zum Zurücksetzen gefunden.";
        }
      });
    }

    if (destInput) {
      destInput.addEventListener("input", () => {
        markDestManual(destInput);
        updateResetButtonState(destInput, destResetBtn);
      });
      destInput.addEventListener("blur", () => {
        updateResetButtonState(destInput, destResetBtn);
        maybeAutoRoute();
      });
    }

    // Heimatadresse aus Storage laden
    if (api.storage && api.storage.local) {
      try {
        const res = await api.storage.local.get(STORAGE_KEY_HOME);
        if (res && res[STORAGE_KEY_HOME] && startInput) {
          startInput.value = res[STORAGE_KEY_HOME];
        }
      } catch {
        // ignorieren
      }
    }

    createAutocompleteController(startInput, {
      onSelect: () => maybeAutoRoute(),
      onEnter: () => maybeAutoRoute(),
      onBlur: () => maybeAutoRoute()
    });

    createAutocompleteController(destInput, {
      onSelect: () => {
        markDestManual(destInput);
        updateResetButtonState(destInput, destResetBtn);
        maybeAutoRoute();
      },
      onEnter: () => maybeAutoRoute()
    });

    function maybeAutoRoute() {
      const start = (startInput && startInput.value.trim()) || "";
      const dest = (destInput && destInput.value.trim()) || "";

      if (!start || !dest || dest === "Ort nicht erkannt") {
        return;
      }

      statusEl.textContent = "Route wird berechnet …";

      if (api.storage && api.storage.local) {
        api.storage.local.set({ [STORAGE_KEY_HOME]: start });
      }

      requestRoute(start, dest);
    }

    // Erste Auto-Berechnung
    if (
      startInput &&
      startInput.value.trim() &&
      destInput &&
      destInput.value.trim() &&
      destInput.value !== "Ort nicht erkannt"
    ) {
      maybeAutoRoute();
    }

    // Re-Aktualisierung bei Änderung der Heimatadresse
    if (startInput) {
      startInput.addEventListener("input", (ev) => {
        handleStartInputChange(ev.target.value || "");
      });

      startInput.addEventListener("blur", () => {
        setTimeout(() => {
          hideSuggestions();
        }, 120);
        maybeAutoRoute();
      });

      startInput.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          moveSuggestionHighlight(1);
          return;
        }
        if (ev.key === "ArrowUp") {
          ev.preventDefault();
          moveSuggestionHighlight(-1);
          return;
        }
        if (ev.key === "Enter") {
          if (suggestionItems.length && suggestionIndex >= 0) {
            ev.preventDefault();
            applySuggestion(suggestionItems[suggestionIndex].label);
            return;
          }
          ev.preventDefault();
          maybeAutoRoute();
          return;
        }
        if (ev.key === "Escape") {
          hideSuggestions();
        }
      });
    }

    // Panel per Pfeil schließen → eingeklappt merken (pro Tab)
    closeBtn.addEventListener("click", () => {
      sessionStorage.setItem(SESSION_KEY_COLLAPSED, "1");
      document.body.style.marginRight = "0";
      panel.style.display = "none";
      collapsedToggle.style.display = "flex";
    });

    // Nachrichten aus map.html
    window.addEventListener("message", (event) => {
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "MAP_READY") {
        mapReady = true;
        mapInitialized = true;
        if (pendingRoute && mapFrame && mapFrame.contentWindow) {
          mapFrame.contentWindow.postMessage(pendingRoute, "*");
        }
        return;
      }

      if (event.data.type === "ROUTE_STATUS" && statusEl) {
        renderRouteStatus(statusEl, event.data.message || "");
      }
    });

    // DOM-Änderungen beobachten (neue Anzeigen im selben Tab)
    let destCheckTimeout = null;

    function scheduleDestCheck() {
      if (destCheckTimeout) return;
      destCheckTimeout = setTimeout(() => {
        destCheckTimeout = null;
        const newDest = getDestinationAddress(currentSite);
        const canonicalNew = canonicalAddress(newDest);
        if (canonicalNew && canonicalNew !== currentDestCanonical) {
          currentDestFromDom = newDest;
          currentDestCanonical = canonicalNew;
          updateResetButtonState(destInput, destResetBtn);
          if (!destManuallyEdited && destInput) {
            setDestFromDom(destInput, newDest);
            maybeAutoRoute();
          }
        } else if (!canonicalNew && currentDestFromDom) {
          currentDestFromDom = null;
          currentDestCanonical = null;
          updateResetButtonState(destInput, destResetBtn);
          if (!destManuallyEdited && destInput) {
            setDestFromDom(destInput, "Ort nicht erkannt");
          }
        }
      }, 300);
    }

    const observer = new MutationObserver(() => {
      scheduleDestCheck();
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {
      // ignorieren
    }
  }

  function createAutocompleteController(input, options = {}) {
    if (!input) return null;
    const field = input.closest(".rh-field");
    if (!field) return null;

    const { onSelect = null, onEnter = null, onBlur = null } = options;

    const suggestionBox = document.createElement("div");
    suggestionBox.className = "rh-suggestions";
    suggestionBox.style.display = "none";
    field.appendChild(suggestionBox);

    let suggestionItems = [];
    let suggestionIndex = -1;
    let suggestionFetchTimeout = null;
    let suggestionAbortController = null;
    let suggestionRequestId = 0;

    function hideSuggestions() {
      suggestionBox.style.display = "none";
      suggestionBox.innerHTML = "";
      suggestionItems = [];
      suggestionIndex = -1;
    }

    function cancelSuggestionRequest() {
      if (suggestionAbortController) {
        suggestionAbortController.abort();
        suggestionAbortController = null;
      }
      if (suggestionFetchTimeout) {
        clearTimeout(suggestionFetchTimeout);
        suggestionFetchTimeout = null;
      }
    }

    function renderSuggestions(items) {
      suggestionBox.innerHTML = "";
      suggestionItems = items;
      suggestionIndex = -1;

      if (!items.length) {
        hideSuggestions();
        return;
      }

      suggestionBox.style.display = "block";

      items.forEach((item) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "rh-suggestion";
        option.textContent = item.label;
        option.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          applySuggestion(item.label);
        });
        suggestionBox.appendChild(option);
      });
    }

    function updateSuggestionHighlight() {
      const nodes = suggestionBox.querySelectorAll(".rh-suggestion");
      nodes.forEach((node, idx) => {
        if (idx === suggestionIndex) {
          node.classList.add("rh-suggestion--active");
        } else {
          node.classList.remove("rh-suggestion--active");
        }
      });
    }

    function moveSuggestionHighlight(delta) {
      if (!suggestionItems.length) return;
      suggestionIndex += delta;
      if (suggestionIndex < 0) {
        suggestionIndex = suggestionItems.length - 1;
      } else if (suggestionIndex >= suggestionItems.length) {
        suggestionIndex = 0;
      }
      updateSuggestionHighlight();
    }

    function applySuggestion(text) {
      input.value = text;
      hideSuggestions();
      input.focus();
      if (typeof onSelect === "function") {
        onSelect(text);
      }
    }

    async function fetchSuggestions(query) {
      cancelSuggestionRequest();
      suggestionAbortController = new AbortController();
      const requestId = ++suggestionRequestId;

      const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        addressdetails: "1"
      });

      try {
        const res = await fetch(`${NOMINATIM_AUTOCOMPLETE_URL}?${params.toString()}`, {
          headers: {
            "Accept-Language": "de",
            "User-Agent": "RouteHelperExtension/1.0 (autocomplete)"
          },
          signal: suggestionAbortController.signal
        });

        if (!res.ok) {
          throw new Error("Autocomplete fehlgeschlagen");
        }

        const data = await res.json();
        if (requestId !== suggestionRequestId) return;

        const items =
          Array.isArray(data)
            ? data
                .map((entry) => ({
                  label: (entry && entry.display_name ? entry.display_name : "").trim(),
                  countryCode:
                    entry &&
                    entry.address &&
                    entry.address.country_code
                      ? entry.address.country_code.toLowerCase()
                      : null
                }))
                .filter((entry) => entry.label)
            : [];

        if (!items.length) {
          hideSuggestions();
          return;
        }
        const sorted = sortSuggestionsByCountry(items);
        renderSuggestions(sorted);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn("[Route-Addon] Autocomplete Fehler:", err);
        hideSuggestions();
      }
    }

    function scheduleSuggestionFetch(query) {
      cancelSuggestionRequest();
      suggestionFetchTimeout = setTimeout(() => {
        fetchSuggestions(query);
      }, AUTOCOMPLETE_DELAY);
    }

    function handleInputChange(value) {
      const trimmed = value.trim();
      if (trimmed.length < AUTOCOMPLETE_MIN_CHARS) {
        hideSuggestions();
        cancelSuggestionRequest();
        return;
      }
      scheduleSuggestionFetch(trimmed);
    }

    input.addEventListener("input", (ev) => {
      handleInputChange(ev.target.value || "");
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        hideSuggestions();
      }, 120);
      if (typeof onBlur === "function") {
        onBlur();
      }
    });

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        moveSuggestionHighlight(1);
        return;
      }
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        moveSuggestionHighlight(-1);
        return;
      }
      if (ev.key === "Enter") {
        if (suggestionItems.length && suggestionIndex >= 0) {
          ev.preventDefault();
          applySuggestion(suggestionItems[suggestionIndex].label);
          return;
        }
        ev.preventDefault();
        if (typeof onEnter === "function") {
          onEnter();
        }
        return;
      }
      if (ev.key === "Escape") {
        hideSuggestions();
      }
    });

    return {
      hide: hideSuggestions
    };
  }

  function deriveCountryFromLanguage(lang) {
    if (!lang || typeof lang !== "string") return null;
    const normalized = lang.trim().toLowerCase();
    if (!normalized) return null;
    const parts = normalized.split(/[-_]/);
    if (parts.length > 1 && parts[1].length === 2) {
      return parts[1];
    }
    const fallback = {
      de: "de",
      en: "us",
      fr: "fr",
      es: "es",
      it: "it",
      pt: "pt",
      nl: "nl",
      sv: "se",
      da: "dk",
      fi: "fi",
      pl: "pl",
      cs: "cz",
      sk: "sk",
      sl: "si",
      hr: "hr",
      hu: "hu",
      ro: "ro",
      bg: "bg",
      el: "gr"
    };
    return fallback[parts[0]] || null;
  }

  function setPreferredCountry(code) {
    if (!code || typeof code !== "string") return;
    preferredCountryCode = code.trim().toLowerCase();
  }

  function initPreferredCountry() {
    if (preferredCountryCode) return;
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const lang of langs) {
      const code = deriveCountryFromLanguage(lang);
      if (code) {
        setPreferredCountry(code);
        break;
      }
    }
    requestGeolocationCountry();
  }

  async function requestGeolocationCountry() {
    if (geolocationRequested || !navigator.geolocation) return;
    geolocationRequested = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const params = new URLSearchParams({
            lat: String(lat),
            lon: String(lon),
            format: "jsonv2",
            zoom: "3"
          });
          const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
            headers: {
              "Accept-Language": "de",
              "User-Agent": "RouteHelperExtension/1.0 (reverse)"
            }
          });
          if (!res.ok) return;
          const data = await res.json();
          const code =
            data &&
            data.address &&
            data.address.country_code &&
            data.address.country_code.toLowerCase();
          if (code) {
            setPreferredCountry(code);
          }
        } catch {
          // ignore errors
        }
      },
      () => {
        // permission denied -> nothing else to do
      },
      { maximumAge: 60 * 60 * 1000, timeout: 8000 }
    );
  }

  function sortSuggestionsByCountry(items) {
    if (!preferredCountryCode) return items;
    return [...items].sort((a, b) => {
      const aMatch = a.countryCode && a.countryCode.toLowerCase() === preferredCountryCode;
      const bMatch = b.countryCode && b.countryCode.toLowerCase() === preferredCountryCode;
      if (aMatch === bMatch) return 0;
      return aMatch ? -1 : 1;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


