/**
 * PATRIMONIO FAMILIAR ISUKIZA - MODULAR JS + ENCRYPTION
 */

// ══════════════════════════════════════════════════
// 1. CONFIGURACIÓN Y CONSTANTES
// ══════════════════════════════════════════════════
const Config = {
    ACCIONES_DEFAULT: [
        { ticker: "AMZN",    nombre: "Amazon",    cant: 20,   mon: "USD", coste: 0, inv: 0 },
        { ticker: "SAN.MC",  nombre: "Santander", cant: 1080, mon: "EUR", coste: 0, inv: 0 },
        { ticker: "OHLA.MC", nombre: "OHLA",      cant: 300,  mon: "EUR", coste: 0, inv: 0 }
    ],
    CARDS: {
        bolsa:     { body: "body-bolsa",     card: "card-bolsa"     },
        fondos:    { body: "body-fondos",    card: "card-fondos"    },
        indie:     { body: "body-indie",     card: "card-indie"     },
        efectivo:  { body: "body-efectivo",  card: "card-efectivo"  },
        epsv:      { body: "body-epsv",      card: "card-epsv"      },
        treemap:   { body: "body-treemap",   card: "card-treemap"   },
        evolucion: { body: "body-evolucion", card: "card-total"     }
    },
    COLORES: {
        total: "#4ade80", efectivo: "#22d3ee", fondos: "#a78bfa",
        indie: "#34d399", epsv: "#fb7185", bolsa: "#3b82f6"
    },
    TREEMAP_CATS: [
        { key: 'bolsa',    label: 'Bolsa',    color: '#3b82f6' },
        { key: 'fondos',   label: 'Fondos',   color: '#8b5cf6' },
        { key: 'indie',    label: 'Indie',    color: '#10b981' },
        { key: 'epsv',     label: 'EPSV',     color: '#f43f5e' },
        { key: 'efectivo', label: 'Efectivo', color: '#06b6d4' }
    ],
    PROXIES: [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ]
};


// ══════════════════════════════════════════════════
// MÓDULO DE SINCRONIZACIÓN EN LA NUBE (GitHub)
// ══════════════════════════════════════════════════
const Cloud = {
    REPO: "Isukiza/mis-inversiones",
    FILE: "isukiza_cloud_data.json",

    getToken() {
        const enc = localStorage.getItem("isukiza_cloud_token");
        if (!enc || !State.masterKey) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(enc, State.masterKey);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch(e) { return null; }
    },
    saveToken(token) {
        if (!State.masterKey) return;
        const enc = CryptoJS.AES.encrypt(token, State.masterKey).toString();
        localStorage.setItem("isukiza_cloud_token", enc);
    },
    promptToken() {
        const token = prompt("Introduce tu GitHub Personal Access Token:\n(Se guardará cifrado, no volverá a pedírsete)");
        if (token && token.startsWith("ghp_")) {
            this.saveToken(token.trim());
            UI.showToast("✓ Token guardado — sincronización activada");
            return token.trim();
        } else if (token) { alert("Token no válido. Debe empezar por ghp_"); }
        return null;
    },
    _headers() {
        const token = this.getToken();
        if (!token) return null;
        return { "Authorization": `token ${token}`, "Content-Type": "application/json", "User-Agent": "isukiza-app" };
    },
    async getSHA() {
        try {
            const headers = this._headers();
            if (!headers) return null;
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) return null;
            const d = await r.json();
            return d.sha;
        } catch(e) { return null; }
    },
    async guardar() {
        let headers = this._headers();
        if (!headers) { const token = this.promptToken(); if (!token) return; headers = this._headers(); }
        UI.setStatus("Guardando en nube...", "amber");
        try {
            const d = Storage._load("isukiza_v4_enc") || {};
            const exportData = {
                _version: 2, _fecha: new Date().toISOString(),
                _device: navigator.userAgent.includes("Mobile") ? "móvil" : "escritorio",
                historial: State.historial, acciones: State.acciones,
                f1_vl: d.f1_vl, f1_part: d.f1_part, f1_coste: d.f1_coste,
                f2_vl: d.f2_vl, f2_part: d.f2_part, f2_coste: d.f2_coste,
                indie_mer: d.indie_mer, indie_inv: d.indie_inv, indie_ef: d.indie_ef,
                p1: d.p1, p2: d.p2, vlp: d.vlp,
                ef_abanca: d.ef_abanca, ef_santander: d.ef_santander,
                ef_kutxa: d.ef_kutxa, ef_myinvestor: d.ef_myinvestor,
                ef_traderepublic: d.ef_traderepublic, ef_casa: d.ef_casa
            };
            const sha  = await this.getSHA();
            const ct   = btoa(unescape(encodeURIComponent(JSON.stringify(exportData, null, 2))));
            const body = { message: `Sync ${new Date().toLocaleString("es-ES")}`, content: ct };
            if (sha) body.sha = sha;
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}`, {
                method: "PUT", headers, body: JSON.stringify(body)
            });
            if (r.ok) {
                UI.setStatus("✓ Guardado en nube", "green");
                UI.showToast("☁️ Sincronizado con la nube");
                localStorage.setItem("isukiza_last_sync", new Date().toISOString());
                this._updateSyncBadge();
            } else { throw new Error(`HTTP ${r.status}`); }
        } catch(e) {
            UI.setStatus("Error al guardar en nube", "red");
            UI.showToast("⚠️ Error de sincronización", "#7c2d12", "#f97316");
        }
    },
    async cargar() {
        let headers = this._headers();
        if (!headers) { const token = this.promptToken(); if (!token) return; headers = this._headers(); }
        UI.setStatus("Cargando desde nube...", "amber");
        try {
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) { UI.showToast("Sin datos en la nube todavía", "#1e293b", "#94a3b8"); return; }
            const d       = await r.json();
            const jsonStr = decodeURIComponent(escape(atob(d.content)));
            App.importarJSON(jsonStr);
            UI.setStatus("✓ Datos cargados desde nube", "green");
            UI.showToast("☁ Datos sincronizados desde la nube");
            localStorage.setItem("isukiza_last_sync", new Date().toISOString());
            localStorage.setItem("isukiza_last_loaded", new Date().toISOString());
            this._updateSyncBadge();
        } catch(e) {
            UI.setStatus("Error al cargar desde nube", "red");
            UI.showToast("⚠️ Error al cargar", "#7c2d12", "#f97316");
        }
    },
    _updateSyncBadge() {
        const el = document.getElementById("syncBadge");
        if (!el) return;
        const last = localStorage.getItem("isukiza_last_sync");
        if (last) {
            const d = new Date(last);
            el.innerText = d.toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
            el.style.display = "inline";
        }
    },
    async autoSync() {
        const headers = this._headers();
        if (!headers) return;
        try {
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) return;
            const d         = await r.json();
            const jsonStr   = decodeURIComponent(escape(atob(d.content)));
            const cloudData = JSON.parse(jsonStr);
            const cloudDate = new Date(cloudData._fecha);
            const lastLoaded = localStorage.getItem("isukiza_last_loaded");
            if (!lastLoaded || cloudDate > new Date(lastLoaded)) {
                const device = cloudData._device || "otro dispositivo";
                const fecha  = cloudDate.toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
                if (confirm(`☁️ Hay datos más recientes en la nube (${fecha} desde ${device}).\n\n¿Cargar datos de la nube?`)) {
                    App.importarJSON(jsonStr);
                    localStorage.setItem("isukiza_last_loaded", cloudData._fecha);
                    localStorage.setItem("isukiza_last_sync", new Date().toISOString());
                    this._updateSyncBadge();
                }
            }
        } catch(e) { console.warn("[Isukiza] autoSync:", e); }
    }
};

// ══════════════════════════════════════════════════
// 2. ESTADO GLOBAL
// ══════════════════════════════════════════════════
let State = {
    acciones: [],
    precios: {},
    cambios: {},
    usd_eur: 0.92,
    historial: [],
    tabActiva: "total",
    colapsado: {},
    _modalEditIdx: -1,
    masterKey: null
};

// ══════════════════════════════════════════════════
// 3. MÓDULO DE SEGURIDAD (Crypto)
// ══════════════════════════════════════════════════
const Crypto = {
    encrypt(data) {
        if (!State.masterKey) return data;
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return CryptoJS.AES.encrypt(str, State.masterKey).toString();
    },
    decrypt(ciphertext) {
        if (!State.masterKey || !ciphertext) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, State.masterKey);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (!decrypted) return null;
            return JSON.parse(decrypted);
        } catch (e) { return null; }
    }
};

// ══════════════════════════════════════════════════
// 4. MÓDULO DE PERSISTENCIA (Storage)
// ══════════════════════════════════════════════════
const Storage = {
    _save(key, data) {
        const encrypted = Crypto.encrypt(data);
        localStorage.setItem(key, encrypted);
    },
    _load(key) {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        return Crypto.decrypt(encrypted);
    },

    saveData() {
        const getVal = id => { const el = document.getElementById(id); return el ? el.value : ""; };
        const tsEl = document.getElementById("fondosTimestamp");
        const data = {
            f1_vl:            getVal("f1_vl"),
            f1_part:          getVal("f1_part"),
            f1_coste:         getVal("f1_coste"),
            f2_vl:            getVal("f2_vl"),
            f2_part:          getVal("f2_part"),
            f2_coste:         getVal("f2_coste"),
            indie_mer:        getVal("indie_mer"),
            indie_inv:        getVal("indie_inv"),
            indie_ef:         getVal("indie_ef"),
            p1:               getVal("p1"),
            p2:               getVal("p2"),
            vlp:              getVal("vlp"),
            ef_abanca:        getVal("ef_abanca"),
            ef_santander:     getVal("ef_santander"),
            ef_kutxa:         getVal("ef_kutxa"),
            ef_myinvestor:    getVal("ef_myinvestor"),
            ef_traderepublic: getVal("ef_traderepublic"),
            ef_casa:          getVal("ef_casa"),
            ts:               tsEl ? tsEl.innerText : ""
        };
        this._save("isukiza_v4_enc", data);
    },

    saveHistorial()    { this._save("isukiza_hist_enc",     State.historial); },
    saveAcciones()     { this._save("isukiza_acciones_enc", State.acciones);  },
    saveCollapseState(){ localStorage.setItem("isukiza_collapse", JSON.stringify(State.colapsado)); },

    loadAll() {
        let d = this._load("isukiza_v4_enc");
        if (!d && localStorage.getItem("isukiza_v4")) {
            try {
                d = JSON.parse(localStorage.getItem("isukiza_v4"));
                State.historial = JSON.parse(localStorage.getItem("isukiza_hist") || "[]");
                State.acciones  = JSON.parse(localStorage.getItem("isukiza_acciones") || JSON.stringify(Config.ACCIONES_DEFAULT));
                this.saveData(); this.saveHistorial(); this.saveAcciones();
            } catch(e) {}
        } else {
            d = d || {};
            State.historial = this._load("isukiza_hist_enc") || [];
            State.acciones  = this._load("isukiza_acciones_enc") || JSON.parse(JSON.stringify(Config.ACCIONES_DEFAULT));
        }

        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
        setVal("f1_vl",            d.f1_vl);
        setVal("f1_part",          d.f1_part);
        setVal("f1_coste",         d.f1_coste);
        setVal("f2_vl",            d.f2_vl);
        setVal("f2_part",          d.f2_part);
        setVal("f2_coste",         d.f2_coste);
        setVal("indie_mer",        d.indie_mer);
        setVal("indie_inv",        d.indie_inv);
        setVal("indie_ef",         d.indie_ef);
        setVal("ef_abanca",        d.ef_abanca);
        setVal("ef_santander",     d.ef_santander);
        setVal("ef_kutxa",         d.ef_kutxa);
        setVal("ef_myinvestor",    d.ef_myinvestor);
        setVal("ef_traderepublic", d.ef_traderepublic);
        setVal("ef_casa",          d.ef_casa);
        setVal("p1",               d.p1  || "1376.6933");
        setVal("p2",               d.p2  || "1975.6095");
        setVal("vlp",              d.vlp);
        const vlp_m = document.getElementById("vlp_m");
        if (vlp_m) vlp_m.value = d.vlp || "";
        const tsEl = document.getElementById("fondosTimestamp");
        if (d.ts && tsEl) tsEl.innerText = d.ts;

        State.colapsado = JSON.parse(localStorage.getItem("isukiza_collapse") || "{}");
        State.acciones.forEach(a => { if (!State.precios[a.ticker]) State.precios[a.ticker] = 0; });
    }
};

// ══════════════════════════════════════════════════
// 5. MÓDULO DE FINANZAS (API)
// ══════════════════════════════════════════════════
const Finance = {
    async fetchPrice(ticker) {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        for (let i = 0; i < Config.PROXIES.length; i++) {
            try {
                const proxyUrl = Config.PROXIES[i](yahooUrl);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                return this.extractPrice(data);
            } catch (e) { 
                console.warn(`Proxy ${i} falló para ${ticker}:`, e.message); 
            }
        }
        throw new Error(`Fallo total para ${ticker}`);
    },
    extractPrice(data) {
        try {
            let contents = data.contents ? (typeof data.contents === 'string' ? JSON.parse(data.contents) : data.contents) : data;
            if (!contents.chart || !contents.chart.result || !contents.chart.result[0]) {
                throw new Error('Estructura de datos inválida');
            }
            const meta  = contents.chart.result[0].meta;
            const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
            const prev  = meta.chartPreviousClose || meta.previousClose || 0;
            const changePct = (prev > 0 && price > 0) ? (price - prev) / prev * 100 : 0;
            return { price, changePct };
        } catch (e) {
            console.error('Error extrayendo precio:', e);
            throw e;
        }
    },
    async updateAllPrices() {
        console.log("[Isukiza] updateAllPrices iniciado");
        UI.setStatus("Actualizando bolsa...", "amber");
        try {
            const r = await this.fetchPrice("EURUSD=X");
            State.usd_eur = 1 / (r.price || 1);
            console.log("[Isukiza] Tipo de cambio EUR/USD:", State.usd_eur);
        } catch (e) { 
            console.warn('[Isukiza] Error obteniendo EURUSD:', e);
            State.usd_eur = 0.92; 
        }
        const promises = State.acciones.map(async a => {
            try {
                console.log(`[Isukiza] Obteniendo precio para ${a.ticker}...`);
                const r = await this.fetchPrice(a.ticker);
                State.precios[a.ticker] = r.price;
                State.cambios[a.ticker] = r.changePct;
                console.log(`[Isukiza] ${a.ticker}: ${r.price}eur (${r.changePct.toFixed(2)}%)`);
            } catch (e) {
                console.warn(`[Isukiza] No se pudo obtener precio para ${a.ticker}:`, e);
                State.precios[a.ticker] = 0;
            }
        });
        await Promise.all(promises);
        const bolsaStatusEl = document.getElementById("bolsaStatus");
        if (bolsaStatusEl) bolsaStatusEl.innerText = "live";
        UI.setStatus(`Bolsa actualizada ${new Date().toLocaleTimeString("es-ES")}`, "green");
        console.log("[Isukiza] updateAllPrices completado");
        UI.renderBolsa();
        if (window.App && typeof window.App.calculateAll === "function") {
            window.App.calculateAll();
        }
    }
};

// ══════════════════════════════════════════════════
// 6. MÓDULO DE INTERFAZ (UI)
// ══════════════════════════════════════════════════
const UI = {
    fmt(n)  { return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    fmtK(n) {
        if (!n) return "0";
        if (Math.abs(n) >= 1000) return (n / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
        return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    setStatus(msg, color) {
        const s = document.getElementById("status");
        if (!s) return;
        const map = { amber: "text-amber-400", green: "text-green-400", red: "text-red-400" };
        s.className = `mono text-[10px] mt-2 ${map[color] || "text-slate-400"}`;
        s.innerText = msg;
    },
    showToast(msg, bg = "#14532d", color = "#4ade80") {
        const t = document.getElementById("snapToast");
        if (!t) return;
        t.style.background = bg; t.style.borderColor = color; t.style.color = color;
        t.innerText = msg; t.style.opacity = "1";
        setTimeout(() => { t.style.opacity = "0"; }, 2500);
    },

    // ── Collapsible ──
    toggleCard(id) {
        State.colapsado[id] = !State.colapsado[id];
        this.applyCollapse(id);
        Storage.saveCollapseState();
        this.updateGlobalBtn();
    },
    toggleAll() {
        const allCollapsed = Object.keys(Config.CARDS).every(id => State.colapsado[id]);
        Object.keys(Config.CARDS).forEach(id => {
            State.colapsado[id] = !allCollapsed;
            this.applyCollapse(id);
        });
        Storage.saveCollapseState();
        this.updateGlobalBtn();
    },
    applyCollapse(id) {
        const cfg = Config.CARDS[id];
        if (!cfg) return;
        const body = document.getElementById(cfg.body);
        const card = document.getElementById(cfg.card);
        const btn  = card ? card.querySelector(".collapse-btn") : null;
        const sum  = document.getElementById(`summary-${id}`);
        if (!body) return;
        if (State.colapsado[id]) {
            body.classList.add("collapsed");
            if (btn)  btn.textContent = "▼";
            if (sum)  { sum.style.display = "inline"; this.updateSummary(id); }
            if (card) card.style.paddingBottom = "16px";
        } else {
            body.classList.remove("collapsed");
            if (btn)  btn.textContent = "▲";
            if (sum)  sum.style.display = "none";
            if (card) card.style.paddingBottom = "";
            if (typeof this.refreshCharts === "function") {
                setTimeout(() => this.refreshCharts(), 50);
            }
        }
    },
    updateSummary(id) {
        const el = document.getElementById(`summary-${id}`);
        if (!el || !window.App || typeof window.App.getValues !== "function") return;
        const v = window.App.getValues();
        let txt = "";
        switch (id) {
            case "bolsa":     txt = v.bolsa    > 0 ? this.fmt(v.bolsa)    + " €" : "—"; break;
            case "fondos": {
                txt = v.fondos > 0 ? this.fmt(v.fondos) + " €" : "—";
                if (typeof window.App.getFondosTotals === "function") {
                    const f = window.App.getFondosTotals();
                    if (f.tInv > 0) {
                        const g = f.tMer - f.tInv;
                        txt += `  ${g >= 0 ? "+" : ""}${(g / f.tInv * 100).toFixed(2)}%`;
                    }
                }
                break;
            }
            case "indie":     txt = v.indie    > 0 ? this.fmt(v.indie)    + " €" : "—"; break;
            case "efectivo":  txt = v.efectivo > 0 ? this.fmt(v.efectivo) + " €" : "—"; break;
            case "epsv":      txt = v.epsv     > 0 ? this.fmt(v.epsv)     + " €" : "—"; break;
            case "treemap":   txt = v.total    > 0 ? this.fmt(v.total)    + " € total" : "—"; break;
            case "evolucion": txt = `${State.historial.length} snapshot${State.historial.length !== 1 ? "s" : ""}`; break;
        }
        el.textContent = txt;
    },
    updateGlobalBtn() {
        const btn = document.getElementById("btnCollapseAll");
        if (!btn) return;
        const allCollapsed = Object.keys(Config.CARDS).every(id => State.colapsado[id]);
        btn.textContent = allCollapsed ? "▼ Expandir todo" : "▲ Contraer todo";
        btn.classList.toggle("all-collapsed", allCollapsed);
    },

    // ── Fondos ──
    updateFondoDOM(id) {
        const part  = parseFloat(document.getElementById(`${id}_part`)?.value)  || 0;
        const coste = parseFloat(document.getElementById(`${id}_coste`)?.value) || 0;
        const vl    = parseFloat(document.getElementById(`${id}_vl`)?.value)    || 0;
        const valInv = part * coste;
        const valMer = part * vl;
        const gan    = valMer - valInv;
        const ganPct = valInv > 0 ? gan / valInv * 100 : 0;
        const esG    = gan >= 0;
        const invEl = document.getElementById(`${id}_inv`);
        const merEl = document.getElementById(`${id}_mer`);
        if (invEl) invEl.innerText = valInv > 0 ? this.fmt(valInv) + " €" : "—";
        if (merEl) merEl.innerText = valMer > 0 ? this.fmt(valMer) + " €" : "—";
        const box = document.getElementById(`${id}_rent`);
        const val = document.getElementById(`${id}_rent_val`);
        if (box && val) {
            if (valInv > 0) {
                box.classList.remove("hidden"); box.classList.add("flex");
                val.className = `mono text-base font-bold ${esG ? "gain" : "loss"}`;
                val.innerText = `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${ganPct.toFixed(2)}%)`;
            } else {
                box.classList.add("hidden"); box.classList.remove("flex");
            }
        }
    },
    updateTotalFondosDOM() {
        if (!window.App || typeof window.App.getFondosTotals !== "function") return;
        const f = window.App.getFondosTotals();
        const gan = f.tMer - f.tInv;
        const pct = f.tInv > 0 ? gan / f.tInv * 100 : 0;
        const esG = gan >= 0;
        const valEl = document.getElementById("totalFondosValor");
        if (valEl) valEl.innerText = f.tMer > 0 ? this.fmt(f.tMer) + " €" : "—";
        const el = document.getElementById("totalFondosRentab");
        if (el) {
            el.className = `mono text-[10px] ${f.tInv > 0 ? (esG ? "gain" : "loss") : "text-slate-600"}`;
            el.innerText = f.tInv > 0 ? `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${pct.toFixed(2)}%)` : "";
        }
    },

    // ── Indie ──
    updateIndieDOM() {
        const mer = parseFloat(document.getElementById("indie_mer")?.value) || 0;
        const inv = parseFloat(document.getElementById("indie_inv")?.value) || 0;
        const ef  = parseFloat(document.getElementById("indie_ef")?.value)  || 0;
        const gan = mer - inv;
        const pct = inv > 0 ? gan / inv * 100 : 0;
        const esG = gan >= 0;
        const tot = mer + ef;
        const el  = document.getElementById("indie_rent");
        if (el) {
            if (inv > 0) {
                el.className = `mono text-base font-bold ${esG ? "gain" : "loss"}`;
                el.innerText = `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${pct.toFixed(2)}%)`;
            } else {
                el.className = "mono text-base font-bold text-slate-500";
                el.innerText = "—";
            }
        }
        const totEl = document.getElementById("indie_total");
        if (totEl) totEl.innerText = tot > 0 ? this.fmt(tot) + " €" : "—";
    },

    // ── EPSV ──
    updateEPSVDOM() {
        const vlp = parseFloat(document.getElementById("vlp")?.value) || 0;
        const r1  = (parseFloat(document.getElementById("p1")?.value) || 0) * vlp;
        const r2  = (parseFloat(document.getElementById("p2")?.value) || 0) * vlp;
        const res1 = document.getElementById("res1");
        const res2 = document.getElementById("res2");
        const totalEPSV = document.getElementById("totalEPSV");
        if (res1) res1.innerText = this.fmt(r1) + " €";
        if (res2) res2.innerText = this.fmt(r2) + " €";
        if (totalEPSV) totalEPSV.innerText = this.fmt(r1 + r2) + " €";
    },

    // ── Efectivo ──
    updateEfectivoDOM() {
        const campos = [
            { id: "ef_abanca",        label: "Abanca"         },
            { id: "ef_santander",     label: "Santander"      },
            { id: "ef_kutxa",         label: "Kutxabank"      },
            { id: "ef_myinvestor",    label: "MyInvestor"     },
            { id: "ef_traderepublic", label: "Trade Republic" },
            { id: "ef_casa",          label: "Casa"           }
        ];
        let total = 0;
        const filas = [];
        campos.forEach(c => {
            const el = document.getElementById(c.id);
            const v = el ? (parseFloat(el.value) || 0) : 0;
            total += v;
            if (v > 0) filas.push(`<div class="flex justify-between"><span class="mono text-[11px] text-slate-500">${c.label}</span><span class="mono text-[11px] text-cyan-400">${this.fmt(v)} €</span></div>`);
        });
        const desglose = document.getElementById("ef_desglose");
        if (desglose) {
            if (filas.length > 1) { desglose.innerHTML = filas.join(""); desglose.classList.remove("hidden"); }
            else { desglose.classList.add("hidden"); }
        }
        const totalEl = document.getElementById("ef_total");
        if (totalEl) totalEl.innerText = total > 0 ? this.fmt(total) + " €" : "—";
    },

    // ── Bolsa ──
    renderBolsa() {
        const list = document.getElementById("listaAcciones");
        if (!list) return;
        if (!State.acciones.length) {
            list.innerHTML = '<p class="mono text-[9px] text-slate-600 text-center py-4">Sin valores. Pulsa + para añadir.</p>';
            return;
        }
        let totalBolsaInv = 0, totalBolsaMer = 0;
        list.innerHTML = State.acciones.map((a, idx) => {
            const price     = State.precios[a.ticker] || 0;
            const sub       = price * a.cant;
            const subEur    = a.mon === "USD" ? sub * State.usd_eur : sub;
            const invRaw    = parseFloat(a.inv) || (parseFloat(a.coste) * a.cant) || 0;
            const invEur    = a.mon === "USD" ? invRaw * State.usd_eur : invRaw;
            const gan       = subEur - invEur;
            const ganPct    = invEur > 0 ? gan / invEur * 100 : 0;
            const esG       = gan >= 0;
            totalBolsaInv  += invEur; totalBolsaMer += subEur;

            const esPorEncima = invEur === 0 || subEur >= invEur;
            const rawPct      = State.cambios[a.ticker];
            const dayPct      = (rawPct !== undefined && rawPct !== null) ? rawPct : null;
            const dayEsG      = dayPct === null ? true : dayPct >= 0;
            const badgeColor  = esPorEncima
                ? "background:#052e16;border:1px solid #166534;color:#4ade80;"
                : "background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171;";
            const dayStr      = dayPct !== null
                ? `<span style="color:${dayEsG ? "#4ade80" : "#f87171"}">${dayEsG ? "+" : ""}${dayPct.toFixed(2)}% hoy</span>`
                : "";
            const badgeHTML = price > 0 ? `
                <div style="${badgeColor}border-radius:8px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;font-family:JetBrains Mono,monospace;font-size:10px;font-weight:700;white-space:nowrap;">
                    <span>${esPorEncima ? "🟢" : "🔴"}</span>
                    ${dayStr}
                </div>` : "";

            const rentHTML = invEur > 0 ? `
                <div class="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-1 mt-2">
                    <span class="mono text-[11px] text-slate-500">Rentabilidad</span>
                    <span class="mono text-sm font-bold ${esG ? "gain" : "loss"}">
                        ${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${ganPct.toFixed(2)}%)
                    </span>
                </div>` : "";
            return `
                <div class="bg-slate-900/40 p-3 rounded-xl border border-slate-800 hover:border-blue-700/40 transition-all">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <a href="https://finance.yahoo.com/quote/${a.ticker}" target="_blank" class="font-bold text-slate-200 hover:text-blue-400 text-sm">
                                    ${a.nombre} <span class="text-blue-500 text-[9px]">&#8599;</span>
                                </a>
                                ${badgeHTML}
                            </div>
                            <p class="mono text-[9px] text-slate-500 mt-0.5">${a.cant} uds · ${price.toFixed(2)} ${a.mon}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="text-right">
                                <p class="mono text-base font-bold text-blue-300">${this.fmt(subEur)} &euro;</p>
                                ${a.mon === "USD" ? `<p class="mono text-[8px] text-slate-600">${this.fmt(sub)}${a.mon}</p>` : ""}
                            </div>
                            <button onclick="UI.abrirModal(${idx})" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">✏️</button>
                        </div>
                    </div>
                    ${rentHTML}
                </div>`;
        }).join("");

        const ganT = totalBolsaMer - totalBolsaInv;
        const esGT = ganT >= 0;
        const footer = document.getElementById("bolsaFooter");
        if (footer) {
            footer.className = "mt-3 pt-3 border-t border-slate-800 flex justify-between items-center";
            footer.innerHTML = `
                <span class="mono text-[9px] text-slate-600 uppercase">Total bolsa</span>
                <div class="text-right">
                    <p class="mono text-base font-bold text-blue-300">${this.fmt(totalBolsaMer)} €</p>
                    ${totalBolsaInv > 0 ? `<p class="mono text-[9px] ${esGT ? "gain" : "loss"}">${esGT ? "+" : ""}${this.fmt(ganT)} € (${esGT ? "+" : ""}${(ganT / totalBolsaInv * 100).toFixed(2)}%)</p>` : ""}
                </div>`;
        }
        if (State.colapsado["bolsa"]) this.updateSummary("bolsa");
    },

    // ── Modal ──
    abrirModal(idx) {
        State._modalEditIdx = idx;
        const a = idx === -1 ? { nombre: "", ticker: "", cant: "", mon: "EUR", coste: "", inv: "" } : State.acciones[idx];
        const modal = document.getElementById("modalAccion");
        if (!modal) return;
        document.getElementById("m_nombre").value = a.nombre || "";
        document.getElementById("m_ticker").value = a.ticker || "";
        document.getElementById("m_cant").value   = a.cant   || "";
        document.getElementById("m_mon").value    = a.mon    || "EUR";
        document.getElementById("m_coste").value  = a.coste  || "";
        document.getElementById("m_inv").value    = a.inv    || "";
        
        const btnDelete = document.getElementById("btnDeleteAccion");
        if (btnDelete) btnDelete.style.display = idx === -1 ? "none" : "block";
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    },
    cerrarModal() {
        const modal = document.getElementById("modalAccion");
        if (modal) { modal.classList.add("hidden"); modal.classList.remove("flex"); }
    },
    guardarAccion() {
        const nombre = document.getElementById("m_nombre").value.trim();
        const ticker = document.getElementById("m_ticker").value.trim().toUpperCase();
        const cant   = parseFloat(document.getElementById("m_cant").value) || 0;
        const mon    = document.getElementById("m_mon").value;
        const coste  = parseFloat(document.getElementById("m_coste").value) || 0;
        const inv    = parseFloat(document.getElementById("m_inv").value) || 0;

        if (!nombre || !ticker || cant <= 0) {
            alert("Completa el nombre, ticker y número de acciones.");
            return;
        }

        const obj = { nombre, ticker, cant, mon, coste, inv };
        if (State._modalEditIdx === -1) {
            State.acciones.push(obj);
        } else {
            State.acciones[State._modalEditIdx] = obj;
        }

        Storage.saveAcciones();
        this.cerrarModal();
        Finance.updateAllPrices();
    },
    eliminarAccion() {
        if (State._modalEditIdx >= 0 && confirm("¿Seguro que deseas eliminar este valor?")) {
            State.acciones.splice(State._modalEditIdx, 1);
            Storage.saveAcciones();
            this.cerrarModal();
            this.renderBolsa();
            App.calculateAll();
        }
    },

    // ── Treemap & Historial ──
    renderTreemap(v) {
        const container = document.getElementById("treemapContainer");
        if (!container || !v || v.total <= 0) return;
        
        container.innerHTML = Config.TREEMAP_CATS.map(cat => {
            const val = v[cat.key] || 0;
            const pct = (val / v.total * 100).toFixed(1);
            if (pct <= 0) return "";
            return `
                <div style="flex-grow: ${pct}; background-color: ${cat.color};" class="h-12 rounded-lg flex flex-col justify-center items-center text-white p-1 transition-all">
                    <span class="text-[10px] font-bold leading-none">${cat.label}</span>
                    <span class="text-[9px] opacity-90 leading-none mt-1">${pct}%</span>
                </div>`;
        }).join("");
    },
    renderHistorial() {
        const list = document.getElementById("listaHistorial");
        if (!list) return;
        if (!State.historial.length) {
            list.innerHTML = '<p class="mono text-[9px] text-slate-600 text-center py-4">Sin snapshots guardados.</p>';
            return;
        }
        list.innerHTML = State.historial.slice().reverse().map((item, idx) => {
            const actualIdx = State.historial.length - 1 - idx;
            const d = new Date(item.fecha);
            const dateStr = d.toLocaleDateString("es-ES") + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            return `
                <div class="flex justify-between items-center bg-slate-900/30 p-2 rounded border border-slate-800 text-xs">
                    <div>
                        <p class="mono text-slate-300 font-bold">${this.fmt(item.total)} €</p>
                        <p class="mono text-[9px] text-slate-500">${dateStr}</p>
                    </div>
                    <button onclick="App.eliminarSnapshot(${actualIdx})" class="text-slate-600 hover:text-red-400 p-1">🗑️</button>
                </div>`;
        }).join("");
    }
};

// ══════════════════════════════════════════════════
// 7. MÓDULO PRINCIPAL DE APLICACIÓN (App)
// ══════════════════════════════════════════════════
const App = {
    init() {
        console.log("[Isukiza] Inicializando aplicación...");
        State.masterKey = prompt("Introduce tu clave de cifrado:") || "default_key";
        
        Storage.loadAll();
        
        // Cargar estado de colapso de UI
        Object.keys(Config.CARDS).forEach(id => UI.applyCollapse(id));
        UI.updateGlobalBtn();

        this.calculateAll();
        Finance.updateAllPrices();
        Cloud.autoSync();
    },

    getFondosTotals() {
        const f1_part = parseFloat(document.getElementById("f1_part")?.value) || 0;
        const f1_coste = parseFloat(document.getElementById("f1_coste")?.value) || 0;
        const f1_vl = parseFloat(document.getElementById("f1_vl")?.value) || 0;

        const f2_part = parseFloat(document.getElementById("f2_part")?.value) || 0;
        const f2_coste = parseFloat(document.getElementById("f2_coste")?.value) || 0;
        const f2_vl = parseFloat(document.getElementById("f2_vl")?.value) || 0;

        const tInv = (f1_part * f1_coste) + (f2_part * f2_coste);
        const tMer = (f1_part * f1_vl) + (f2_part * f2_vl);
        return { tInv, tMer };
    },

    getValues() {
        // Bolsa
        let bolsa = 0;
        State.acciones.forEach(a => {
            const price = State.precios[a.ticker] || 0;
            const sub = price * a.cant;
            bolsa += a.mon === "USD" ? sub * State.usd_eur : sub;
        });

        // Fondos
        const fondos = this.getFondosTotals().tMer;

        // Indie
        const indie_mer = parseFloat(document.getElementById("indie_mer")?.value) || 0;
        const indie_ef  = parseFloat(document.getElementById("indie_ef")?.value)  || 0;
        const indie     = indie_mer + indie_ef;

        // EPSV
        const vlp = parseFloat(document.getElementById("vlp")?.value) || 0;
        const p1  = parseFloat(document.getElementById("p1")?.value) || 0;
        const p2  = parseFloat(document.getElementById("p2")?.value) || 0;
        const epsv = (p1 + p2) * vlp;

        // Efectivo
        const ef_abanca        = parseFloat(document.getElementById("ef_abanca")?.value)        || 0;
        const ef_santander     = parseFloat(document.getElementById("ef_santander")?.value)     || 0;
        const ef_kutxa         = parseFloat(document.getElementById("ef_kutxa")?.value)         || 0;
        const ef_myinvestor    = parseFloat(document.getElementById("ef_myinvestor")?.value)    || 0;
        const ef_traderepublic = parseFloat(document.getElementById("ef_traderepublic")?.value) || 0;
        const ef_casa          = parseFloat(document.getElementById("ef_casa")?.value)          || 0;
        const efectivo = ef_abanca + ef_santander + ef_kutxa + ef_myinvestor + ef_traderepublic + ef_casa;

        const total = bolsa + fondos + indie + epsv + efectivo;

        return { bolsa, fondos, indie, epsv, efectivo, total };
    },

    calculateAll() {
        UI.updateFondoDOM("f1");
        UI.updateFondoDOM("f2");
        UI.updateTotalFondosDOM();
        UI.updateIndieDOM();
        UI.updateEPSVDOM();
        UI.updateEfectivoDOM();

        const v = this.getValues();

        const totalEl = document.getElementById("patrimonioTotal");
        if (totalEl) totalEl.innerText = UI.fmt(v.total) + " €";

        UI.renderTreemap(v);
        UI.renderHistorial();
        Storage.saveData();

        // Actualizar resúmenes colapsados
        Object.keys(Config.CARDS).forEach(id => {
            if (State.colapsado[id]) UI.updateSummary(id);
        });
    },

    tomarSnapshot() {
        const v = this.getValues();
        if (v.total <= 0) return;

        const snap = { fecha: new Date().toISOString(), total: v.total, desglose: v };
        State.historial.push(snap);
        Storage.saveHistorial();
        UI.renderHistorial();
        UI.showToast("📸 Snapshot guardado");
        Cloud.guardar();
    },

    eliminarSnapshot(idx) {
        if (confirm("¿Eliminar este registro del historial?")) {
            State.historial.splice(idx, 1);
            Storage.saveHistorial();
            UI.renderHistorial();
            Cloud.guardar();
        }
    },

    importarJSON(jsonStr) {
        try {
            const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
            if (data.acciones) State.acciones = data.acciones;
            if (data.historial) State.historial = data.historial;
            
            Storage.saveAcciones();
            Storage.saveHistorial();

            const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
            setVal("f1_vl",            data.f1_vl);
            setVal("f1_part",          data.f1_part);
            setVal("f1_coste",         data.f1_coste);
            setVal("f2_vl",            data.f2_vl);
            setVal("f2_part",          data.f2_part);
            setVal("f2_coste",         data.f2_coste);
            setVal("indie_mer",        data.indie_mer);
            setVal("indie_inv",        data.indie_inv);
            setVal("indie_ef",         data.indie_ef);
            setVal("p1",               data.p1);
            setVal("p2",               data.p2);
            setVal("vlp",              data.vlp);
            setVal("ef_abanca",        data.ef_abanca);
            setVal("ef_santander",     data.ef_santander);
            setVal("ef_kutxa",         data.ef_kutxa);
            setVal("ef_myinvestor",    data.ef_myinvestor);
            setVal("ef_traderepublic", data.ef_traderepublic);
            setVal("ef_casa",          data.ef_casa);

            Storage.saveData();
            this.calculateAll();
            Finance.updateAllPrices();
        } catch(e) {
            console.error("[Isukiza] Error al importar JSON:", e);
            alert("El formato JSON de importación no es válido.");
        }
    }
};

// Exponer modulos globalmente
window.State = State;
window.UI = UI;
window.Finance = Finance;
window.Cloud = Cloud;
window.Storage = Storage;
window.App = App;

// Inicialización en DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});
