/*
 * MAG (Infomir) portal. Jedina datoteka (uz index.html liniju mag/polyfills.js i mapu mag/) koja se
 * razlikuje od LG / Samsung verzije — sve ostalo je zajednicki kod.
 *
 * Portal se ucitava u MAG pregledniku (stbapp) s Portal URL-a, npr. http://domena:port/portal/.
 * Uredaj se NE prijavljuje samom MAC adresom: uz MAC salje serijski broj i nasumicni token uredaja
 * spremljen na boxu (authQuery), a aktivacija na webu trazi kod prikazan samo na ekranu (pairCode).
 * Tako skener koji pogada MAC adrese ne moze dobiti playlistu. Ugovor s backendom je u MAG.md.
 */
(function () {
    var App = window.App = window.App || {};
    var stb = window.gSTB || null;
    var onTv = !!stb;

    // Backend ide kroz proxy na istom hostu (api/index.php ili nginx /portal/api/ -> app-api-v4.../tv_mag):
    // nema CORS-a ni modernog TLS-a koji MAG 250/254 ne zna. Query oblik (?r=) radi na svakom PHP
    // serveru bez rewrite pravila. Za razvoj u pregledniku: ?api=https://...
    var PANEL = 'api/?r=';
    try {
        var m = String(window.location.search || '').match(/[?&]api=([^&]+)/);
        if (m) PANEL = decodeURIComponent(m[1]).replace(/\/+$/, '');
    } catch (e) { }

    function call(name) {
        if (!stb || typeof stb[name] !== 'function') return undefined;
        try { return stb[name].apply(stb, Array.prototype.slice.call(arguments, 1)); } catch (e) { return undefined; }
    }

    /* ---------------- tipke ----------------
     * MAG salje Alt/Shift uz neke tipke (PLAY = Alt+R ...). Kod = keyCode + 1000 (Shift) + 2000 (Alt),
     * isto kao Infomir SDK.
     */
    var KEYS = {
        37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok',
        8: 'back', 27: 'back',
        112: 'red', 113: 'green', 114: 'yellow', 115: 'blue',
        122: 'menu', 2089: 'info',
        2082: 'playpause', 2083: 'stop', 2066: 'rw', 2070: 'ff',
        9: 'chup', 1009: 'chdown', 33: 'chup', 34: 'chdown'
    };
    var VOL_STEP = 5;

    function volume(delta) {
        var v = parseInt(call('GetVolume'), 10);
        if (isNaN(v)) v = 50;
        v = Math.max(0, Math.min(100, v + delta));
        call('SetMute', 0);
        call('SetVolume', v);
        if (App.toast) App.toast(t('volume', 'Volume') + '  ' + v + '%', 1500);
    }
    function toggleMute() {
        var on = call('GetMute') == 1 ? 0 : 1;
        call('SetMute', on);
        if (App.toast) App.toast(on ? t('mute', 'Mute') : t('volume', 'Volume') + '  ' + (parseInt(call('GetVolume'), 10) || 0) + '%', 1500);
    }
    function togglePower() {
        var standby = call('GetStandByStatus');
        if (standby) { call('StandBy', false); return; }
        try { if (App.Player) App.Player.stop(); } catch (e) { }
        call('StandBy', true);
    }

    /* ---------------- token uredaja ---------------- */
    var TOKEN_KEY = 'lbbe_device_token';
    function loadToken() {
        var v = call('LoadUserData', TOKEN_KEY);
        if (!v) { try { v = window.localStorage.getItem(TOKEN_KEY); } catch (e) { } }
        v = v ? String(v).replace(/[^a-f0-9]/gi, '') : '';
        return v.length >= 32 ? v.substr(0, 32) : '';
    }
    function saveToken(v) {
        call('SaveUserData', TOKEN_KEY, v);
        try { window.localStorage.setItem(TOKEN_KEY, v); } catch (e) { }
    }
    function newToken() {
        var hex = '0123456789abcdef', out = '';
        var rnd = null;
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                rnd = new Uint8Array(16);
                window.crypto.getRandomValues(rnd);
            }
        } catch (e) { rnd = null; }
        for (var i = 0; i < 16; i++) {
            var b = rnd ? rnd[i] : Math.floor(Math.random() * 256);
            // Na boxu bez crypto API-ja umijesaj vrijeme i serijski broj (razliciti boxovi, isti trenutak).
            if (!rnd) b = (b ^ ((new Date().getTime() >> (i % 8)) & 255) ^ (serial().charCodeAt(i % Math.max(1, serial().length)) || 0)) & 255;
            out += hex.charAt(b >> 4) + hex.charAt(b & 15);
        }
        return out;
    }
    var token = '';
    function deviceToken() {
        if (token) return token;
        token = loadToken();
        if (!token) { token = newToken(); saveToken(token); }
        return token;
    }

    var _serial = null;
    function serial() {
        if (_serial !== null) return _serial;
        _serial = String(call('GetDeviceSerialNumber') || '').replace(/^\s+|\s+$/g, '');
        return _serial;
    }
    function model() {
        var v = call('GetDeviceModelExt') || call('GetDeviceModel') || call('RDir', 'Model') || '';
        return String(v).replace(/^\s+|\s+$/g, '');
    }

    /** Kratki hash (djb2 x2) za kod aktivacije; isti algoritam je opisan u MAG.md za backend. */
    function code6(s) {
        var a = 5381, b = 52711;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            a = ((a << 5) + a + c) | 0;
            b = ((b << 5) + b + c) | 0;
        }
        var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O i 1/I
        var n = (a >>> 0), k = (b >>> 0), out = '';
        for (var j = 0; j < 6; j++) {
            out += abc.charAt((j < 3 ? n : k) % 32);
            if (j < 3) n = Math.floor(n / 32); else k = Math.floor(k / 32);
        }
        return out;
    }

    /* ======================= MAG player (gSTB) ======================= */
    // Aspect: niski nibble = omjer izvora (0 auto, 2 16:9), visoki = nacin (1 letterbox, 4 povecaj, 5 optimalno).
    var ASPECT = { fit: 0x10, zoom: 0x40, auto: 0x50, stretch: 0x02 };
    var current = null;

    function MagEngine(layer) {
        var d = document.createElement('div');
        d.id = 'av';
        d.style.background = 'transparent'; // video je ISPOD web sloja; crna kutija bi ga prekrila
        layer.appendChild(d);
        this.el = d;
        this.id = 'mag';
        this.ratios = ['fit', 'zoom', 'auto', 'stretch'];
        this.cb = {};
        this.url = '';
        this.st = 'idle';
        this.startAt = 0;
        this.timer = null;
        this.rect = [0, 0, 0, 0];
        current = this;
        call('InitPlayer');
    }
    MagEngine.prototype = {
        on: function (cb) { this.cb = cb || {}; },
        fire: function (ev) { if (this.cb[ev]) this.cb[ev](); },
        onStb: function (code) {
            if (!this.url) return;
            if (code === 4) {               // reprodukcija pocela
                if (this.startAt > 0) { call('SetPosTime', Math.floor(this.startAt)); this.startAt = 0; }
                this.st = 'playing';
                this.applyRect();
                this.fire('ready');
                this.fire('playing');
                this.tick(true);
            } else if (code === 1) {        // kraj streama
                this.st = 'ended';
                this.tick(false);
                this.fire('ended');
            } else if (code === 5 || code === 8) { // nema veze / greska sadrzaja
                this.st = 'error';
                this.tick(false);
                this.fire('error');
            }
        },
        tick: function (on) {
            var self = this;
            clearInterval(this.timer);
            this.timer = on ? setInterval(function () { if (self.st === 'playing') self.fire('time'); }, 1000) : null;
        },
        open: function (url, opts) {
            this.url = url;
            this.startAt = (opts && opts.start) || 0;
            this.st = 'loading';
            this.tick(false);
            call('Stop');
            // HLS kroz ffmpeg rjesenje, sve ostalo (TS, MP4, MKV) "auto".
            var sol = /\.m3u8(\?|$)/i.test(url) ? 'ffmpeg ' : 'auto ';
            call('Play', sol + url);
            this.fire('buffering');
            if (!onTv) { var self = this; setTimeout(function () { self.onStb(5); }, 0); }
        },
        stop: function () {
            this.url = '';
            this.st = 'idle';
            this.tick(false);
            call('Stop');
        },
        pause: function () { call('Pause'); this.st = 'paused'; this.fire('paused'); },
        resume: function () { call('Continue'); this.st = 'playing'; this.fire('playing'); },
        isPlaying: function () { return this.st === 'playing'; },
        time: function () { return parseFloat(call('GetPosTime')) || 0; },
        duration: function () {
            var d = parseFloat(call('GetMediaLen')) || 0;
            return (d > 0 && d < 86400 * 2) ? d : 0;
        },
        seek: function (sec) { call('SetPosTime', Math.max(0, Math.floor(sec))); },
        setRect: function (x, y, w, h) {
            var s = this.el.style;
            s.left = x + 'px'; s.top = y + 'px'; s.width = w + 'px'; s.height = h + 'px';
            this.rect = [x, y, w, h];
            this.applyRect();
        },
        applyRect: function () {
            var r = this.rect;
            if (r[2] >= 1900 && r[3] >= 1060) { call('SetPIG', 1, -1, -1, -1); return; }   // puni ekran
            // Koordinate dolaze iz getBoundingClientRect; MAG viewport je u pikselima grafike.
            var k = App.Platform.rectScale();
            if (r[2] <= 0 || r[3] <= 0) { call('SetViewport', 1, 1, 0, 0); return; }
            call('SetViewport', Math.round(r[2] * k), Math.round(r[3] * k), Math.round(r[0] * k), Math.round(r[1] * k));
        },
        setRatio: function (mode) { call('SetAspect', ASPECT.hasOwnProperty(mode) ? ASPECT[mode] : ASPECT.fit); },
        /** MAG vraca liste kao JS literal ([{pid:1,lang:['eng','']}]), ne strogi JSON. */
        pids: function (fn) {
            var s = call(fn);
            if (!s) return [];
            try { return new Function('return ' + s)() || []; } catch (e) { return []; }
        },
        tracks: function (kind) {
            var list = this.pids(kind === 'audio' ? 'GetAudioPIDs' : 'GetSubtitlePIDs');
            var cur = parseInt(call(kind === 'audio' ? 'GetAudioPID' : 'GetSubtitlePID'), 10);
            var out = [];
            for (var i = 0; i < list.length; i++) {
                var l = list[i] || {};
                var lang = l.lang && l.lang.length ? (l.lang[0] || l.lang[1] || '') : '';
                out.push({ index: l.pid, label: lang || ((kind === 'audio' ? 'Audio ' : 'Sub ') + (i + 1)), on: l.pid === cur });
            }
            return out;
        },
        setTrack: function (kind, idx) {
            if (kind === 'audio') { call('SetAudioPID', idx); return; }
            if (idx < 0) { call('SetSubtitles', false); return; }
            call('SetSubtitlePID', idx);
            call('SetSubtitles', true);
        },
        suspend: function () { if (this.st === 'playing') this.pause(); },
        restore: function () { if (this.url && this.st === 'paused') this.resume(); }
    };

    // MAG javlja dogadaje playera kroz globalni objekt stbEvent.
    window.stbEvent = {
        event: 0,
        onEvent: function (ev) {
            var code = parseInt(ev, 10);
            if (current && !isNaN(code)) current.onStb(code);
        }
    };

    /* ======================= platforma ======================= */
    App.Platform = {
        name: 'mag',
        label: 'MAG',
        panelUrl: PANEL,
        version: '3.0.0',
        engines: onTv ? [{ id: 'mag', label: 'MAG player' }] : [{ id: 'html5', label: 'HTML5' }],
        onTv: onTv,
        scale: 1,

        /**
         * Faktor od koordinata iz getBoundingClientRect do piksela grafike. Uz CSS zoom neki
         * preglednici vec vracaju skalirane koordinate (Chromium), a neki ne (stari WebKit) —
         * zato se mjeri na #app (sirok 1920 CSS px), a ne pretpostavlja.
         */
        rectScale: function () {
            var k = App.Platform.scale;
            if (k === 1) return 1;
            var el = document.getElementById('app');
            var w = el ? el.getBoundingClientRect().width : 0;
            var f = w > 0 ? w / 1920 : 1;
            return k / f;
        },

        init: function (cb) {
            if (App.Engines) App.Engines.mag = MagEngine;
            if (onTv) {
                call('SetTopWin', 0);          // web sloj iznad videa
                call('EnableVKButton', false); // bez sistemske virtualne tipkovnice na tipki KB
                call('SetDefaultFlicker', 1);
            }
            // Aplikacija je nacrtana za 1920x1080; MAG grafika je cesto 1280x720 -> skaliraj.
            var w = window.innerWidth || (window.screen && window.screen.width) || 1920;
            var k = w / 1920;
            if (k > 0.3 && Math.abs(k - 1) > 0.01) {
                App.Platform.scale = k;
                document.documentElement.style.zoom = k;
            }
            cb();
        },

        keyAction: function (e) {
            var k = e.keyCode || e.which;
            if (e.shiftKey) k += 1000;
            if (e.altKey) k += 2000;
            if (k >= 48 && k <= 57) return String(k - 48);
            if (k >= 96 && k <= 105) return String(k - 96);
            // Glasnoca, mute i power na MAG-u mora rijesiti portal.
            if (k === 107) { e.preventDefault(); volume(VOL_STEP); return null; }
            if (k === 109) { e.preventDefault(); volume(-VOL_STEP); return null; }
            if (k === 2192) { e.preventDefault(); toggleMute(); return null; }
            if (k === 2085) { e.preventDefault(); togglePower(); return null; }
            if (!onTv) {
                if (k === 8 && document.activeElement && document.activeElement.tagName === 'INPUT') return null;
                var ch = String.fromCharCode(e.keyCode).toLowerCase();
                if (e.altKey && ch === 'r') return 'red';
                if (e.altKey && ch === 'g') return 'green';
                if (e.altKey && ch === 'y') return 'yellow';
                if (e.altKey && ch === 'b') return 'blue';
                if (e.keyCode === 32 && document.activeElement && document.activeElement.tagName !== 'INPUT') return 'playpause';
            }
            return KEYS[k] || null;
        },

        getDeviceId: function () {
            return new Promise(function (resolve) {
                var mac = String(call('GetDeviceMacAddress') || '').replace(/^\s+|\s+$/g, '');
                resolve(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac) ? mac.toUpperCase() : fallbackId());
            });
        },

        /** Uz MAC: serijski broj, token uredaja, kod aktivacije i model (vidi MAG.md). */
        authQuery: function () {
            return 'sn=' + encodeURIComponent(serial()) +
                '&dt=' + encodeURIComponent(deviceToken()) +
                '&pc=' + encodeURIComponent(App.Platform.pairCode()) +
                '&model=' + encodeURIComponent(model());
        },
        /** Kod za aktivaciju na webu; vidljiv samo na ekranu ovog boxa. */
        pairCode: function () { return code6(deviceToken() + '|' + (App.mac || '') + '|' + serial()); },

        deviceInfo: function () {
            return new Promise(function (resolve) {
                var info = { model: '', platform: 'MAG', connection: '', localIp: '' };
                var mdl = model();
                var fw = call('GetDeviceImageDesc') || call('GetDeviceVersionHardware') || '';
                info.model = mdl + (fw ? ' · ' + fw : '');
                if (call('GetLanLinkStatus')) info.connection = 'Ethernet';
                else if (call('GetWifiLinkStatus')) info.connection = 'Wi-Fi';
                info.localIp = String(call('RDir', 'IPAddress') || '').replace(/^\s+|\s+$/g, '');
                resolve(info);
            });
        },

        exit: function () {
            try { if (App.Player && App.Player.engine) App.Player.engine.stop(); } catch (e) { }
            // Povratak u ugradjeni MAG izbornik (unutarnji portal).
            if (onTv) { window.location.href = 'file:///home/web/services.html'; return; }
            try { window.close(); } catch (e) { }
        }
    };

    /** Bez MAG-a (razvoj u pregledniku): stalni nasumicni ID u localStorageu. */
    function fallbackId() {
        var id = null;
        try { id = window.localStorage.getItem('lbbe_device_id'); } catch (e) { }
        if (!id) {
            var hex = '0123456789ABCDEF', parts = [];
            for (var i = 0; i < 6; i++) parts.push(hex.charAt(Math.floor(Math.random() * 16)) + hex.charAt(Math.floor(Math.random() * 16)));
            id = parts.join(':');
            try { window.localStorage.setItem('lbbe_device_id', id); } catch (e) { }
        }
        return id;
    }
})();
