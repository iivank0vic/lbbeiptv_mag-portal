/*
 * Zajednicki pomocnici. ES5 namjerno (stari Tizen/webOS Chromium) — bez arrow funkcija,
 * let/const, template stringova, klasa i destrukturiranja.
 */
var App = window.App || {};
window.App = App;

var U = App.U = {
    byId: function (id) { return document.getElementById(id); },
    qs: function (sel, root) { return (root || document).querySelector(sel); },
    qsa: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },

    esc: function (s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    /** URL za src/href atribut: samo http(s) i relativne slike, sve ostalo prazno. */
    safeUrl: function (s) {
        if (!s || typeof s !== 'string') return '';
        s = s.trim();
        if (/^https?:\/\//i.test(s) || /^images\//.test(s)) return U.esc(s);
        return '';
    },
    show: function (el, on) {
        if (typeof el === 'string') el = U.byId(el);
        if (!el) return;
        if (on === false) el.classList.add('hidden'); else el.classList.remove('hidden');
    },
    hide: function (el) { U.show(el, false); },
    toggle: function (el, cls, on) { if (el) { if (on) el.classList.add(cls); else el.classList.remove(cls); } },

    pad2: function (n) { n = Math.floor(Math.abs(n)); return n < 10 ? '0' + n : '' + n; },
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    now: function () { return new Date().getTime(); },

    /** Sekunde -> "1:02:03" ili "02:03". */
    fmtDur: function (sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
        return (h ? h + ':' + U.pad2(m) : U.pad2(m)) + ':' + U.pad2(s);
    },
    /** Sat prema postavci 12/24 h. */
    fmtClock: function (date) {
        if (!(date instanceof Date)) date = new Date(date);
        var h = date.getHours(), m = date.getMinutes();
        if (App.Settings && App.Settings.get('time_format') === '12') {
            var ap = h >= 12 ? 'PM' : 'AM';
            h = h % 12; if (h === 0) h = 12;
            return h + ':' + U.pad2(m) + ' ' + ap;
        }
        return U.pad2(h) + ':' + U.pad2(m);
    },
    fmtDate: function (date) {
        if (!(date instanceof Date)) date = new Date(date);
        return U.pad2(date.getDate()) + '.' + U.pad2(date.getMonth() + 1) + '.' + date.getFullYear() + '.';
    },
    fmtDayName: function (date) {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[date.getDay()] + ' ' + U.pad2(date.getDate()) + '.' + U.pad2(date.getMonth() + 1) + '.';
    },
    fmtNumber: function (n) {
        return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },
    /** "2026-10-16" ili "2026-10-16 20:00:00" -> lokalni Date (bez vremenske zone). */
    parseDate: function (s) {
        if (!s) return null;
        var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (!m) return null;
        return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    },
    /** Isto kao parseDate, ali kao da je string u UTC-u (za racunanje s vremenom servera). */
    parseDateUTC: function (s) {
        var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (!m) return NaN;
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    },
    /** Base64 (UTF-8) iz Xtream EPG-a; ako nije base64 vraca ulaz. */
    b64: function (s) {
        if (!s) return '';
        if (!/^[A-Za-z0-9+\/=\s]+$/.test(s) || s.length % 4 !== 0) return s;
        try { return decodeURIComponent(escape(window.atob(s))); } catch (e) {
            try { return window.atob(s); } catch (e2) { return s; }
        }
    },
    hash: function (s) {
        var h = 5381;
        s = String(s || '');
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    },
    debounce: function (fn, ms) {
        var t = null;
        var d = function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
        d.cancel = function () { clearTimeout(t); };
        return d;
    },
    /** Normalizacija za pretragu (mala slova, bez dijakritika). */
    norm: function (s) {
        s = String(s || '').toLowerCase();
        var map = { 'č': 'c', 'ć': 'c', 'ž': 'z', 'š': 's', 'đ': 'd', 'á': 'a', 'à': 'a', 'ä': 'a', 'é': 'e', 'è': 'e', 'ë': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };
        return s.replace(/[čćžšđáàäéèëíóöúüñ]/g, function (c) { return map[c] || c; });
    },

    /* ---------------- HTTP ---------------- */
    /**
     * GET/POST preko XHR-a (fetch nema na starim TV-ima).
     * opts: url, method, timeout (ms), type 'json'|'text', body, onProgress.
     * Vraca Promise; reject dobiva {status, statusText, timeout}.
     */
    http: function (opts) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var done = false;
            xhr.open(opts.method || 'GET', opts.url, true);
            xhr.timeout = opts.timeout || 30000;
            if (opts.type === 'arraybuffer') { try { xhr.responseType = 'arraybuffer'; } catch (e) { } }
            if (opts.headers) {
                for (var k in opts.headers) if (opts.headers.hasOwnProperty(k)) xhr.setRequestHeader(k, opts.headers[k]);
            }
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4 || done) return;
                done = true;
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (opts.type === 'arraybuffer') { resolve(xhr.response); return; }
                    var txt = xhr.responseText;
                    if (opts.type === 'json') {
                        var data = U.parseJSON(txt);
                        if (data === undefined) {
                            reject({ status: xhr.status, statusText: 'parse', parse: true });
                            return;
                        }
                        resolve(data);
                    } else {
                        resolve(txt);
                    }
                } else {
                    // Tijelo greske treba (npr. 403 {"error":"pairing_required","pairing_code":...}).
                    var body = '';
                    try { body = opts.type === 'arraybuffer' ? '' : (xhr.responseText || ''); } catch (e) { }
                    reject({ status: xhr.status, statusText: xhr.statusText || '', body: body, data: U.parseJSON(body) });
                }
            };
            xhr.ontimeout = function () {
                if (done) return;
                done = true;
                reject({ status: 0, statusText: 'timeout', timeout: true });
            };
            xhr.onerror = function () {
                if (done) return;
                done = true;
                reject({ status: 0, statusText: 'network' });
            };
            if (opts.onProgress) xhr.onprogress = opts.onProgress;
            try { xhr.send(opts.body || null); } catch (e) { done = true; reject({ status: 0, statusText: 'network' }); }
        });
    },
    getJSON: function (url, timeout, headers) { return U.http({ url: url, type: 'json', timeout: timeout, headers: headers }); },
    getText: function (url, timeout) { return U.http({ url: url, type: 'text', timeout: timeout }); },
    /** JSON s BOM-om / smecem ispred; undefined ako nije JSON. */
    parseJSON: function (txt) {
        if (txt === null || txt === undefined) return undefined;
        txt = String(txt).replace(/^﻿/, '').trim();
        if (txt === '') return null;
        try { return JSON.parse(txt); } catch (e) {
            var i = txt.search(/[\[{]/);
            if (i > 0) { try { return JSON.parse(txt.substr(i)); } catch (e2) { } }
            return undefined;
        }
    },
    /** Niz iz Xtream odgovora (neki serveri vracaju objekt umjesto niza ili null). */
    toArray: function (data) {
        if (!data) return [];
        if (Object.prototype.toString.call(data) === '[object Array]') return data;
        if (typeof data === 'object') {
            var out = [];
            for (var k in data) if (data.hasOwnProperty(k) && data[k] && typeof data[k] === 'object') out.push(data[k]);
            return out;
        }
        return [];
    },
    str: function (v) { return (v === null || v === undefined) ? '' : String(v); },

    /* ---------------- pohrana ---------------- */
    store: {
        // Memorijska kopija: liste favorita / nastavka se citaju za svaki red liste.
        cache: {},
        get: function (key, def) {
            var c = U.store.cache;
            if (c.hasOwnProperty(key)) return c[key] === undefined ? def : U.store.clone(c[key]);
            var p;
            try {
                var v = window.localStorage.getItem(key);
                p = (v === null || v === undefined) ? undefined : JSON.parse(v);
            } catch (e) { p = undefined; }
            if (p === null) p = undefined;
            c[key] = p;
            return p === undefined ? def : U.store.clone(p);
        },
        /** Samo za citanje (bez kopije) — ne mijenjati vraceni objekt. */
        peek: function (key, def) {
            var c = U.store.cache;
            if (!c.hasOwnProperty(key)) U.store.get(key, def);
            return c[key] === undefined ? def : c[key];
        },
        clone: function (v) {
            if (v && typeof v === 'object') return JSON.parse(JSON.stringify(v));
            return v;
        },
        set: function (key, val) {
            U.store.cache[key] = U.store.clone(val);
            try { window.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) {
                // Pun localStorage: makni najstarije pozicije nastavka pa probaj jos jednom.
                try {
                    U.store.prune();
                    window.localStorage.setItem(key, JSON.stringify(val));
                    return true;
                } catch (e2) { return false; }
            }
        },
        remove: function (key) { delete U.store.cache[key]; try { window.localStorage.removeItem(key); } catch (e) { } },
        prune: function () {
            try {
                for (var i = window.localStorage.length - 1; i >= 0; i--) {
                    var k = window.localStorage.key(i);
                    if (k && k.indexOf(':resume') > 0) { window.localStorage.removeItem(k); delete U.store.cache[k]; }
                }
            } catch (e) { }
        }
    },

    /* ---------------- QR ---------------- */
    qrDataUrl: function (text) {
        try {
            var qr = window.qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            return qr.createDataURL(8, 0);
        } catch (e) { return ''; }
    },

    log: function () {
        if (window.console && console.log) {
            try { console.log.apply(console, ['[LBBE]'].concat(Array.prototype.slice.call(arguments))); } catch (e) { }
        }
    }
};

/** Klasa na <html> i <body> (prozirnost za video ispod web sloja). */
App.rootClass = function (cls, on) {
    U.toggle(document.documentElement, cls, on);
    U.toggle(document.body, cls, on);
};

/* Toast (kratka poruka na dnu ekrana). */
App.toast = (function () {
    var timer = null;
    return function (text, ms) {
        var el = U.byId('toast');
        if (!el) return;
        el.innerHTML = '<div>' + U.esc(text) + '</div>';
        U.show(el);
        clearTimeout(timer);
        timer = setTimeout(function () { U.hide(el); }, ms || 2600);
    };
})();
