/*
 * Reprodukcija. Dva enginea iza istog sucelja:
 *  - 'avplay' : Samsung webapis.avplay (najpouzdaniji za IPTV na Tizenu)
 *  - 'html5'  : <video> (LG webOS; na Samsungu rezerva)
 * App.Player je kontroler iznad enginea: trenutni medij, pravokutnik (pregled / puni ekran),
 * ponovni pokusaj kod greske i spremanje pozicije nastavka.
 */
(function () {
    /*
     * Nacini slike u punom ekranu (Android AspectModes): 'fill' (zadano: popuni ekran, ali odrezi najvise
     * 5 % po rubu — logo kanala ostaje), 'fit', 'zoom' (reze sve sto ne stane), 'stretch', '16_9', '4_3'.
     * Mali pregled je uvijek Fit. AVPlay ne moze rezati sliku, pa nema fill/zoom.
     */
    var RATIOS = {
        html5: ['fill', 'fit', 'zoom', 'stretch', '16_9', '4_3'],
        avplay: ['fit', 'auto', 'stretch', '16_9', '4_3']
    };
    var SAFE_CROP = 0.05;
    /** [w, h] slike unutar okvira fw x fh (okvir reze visak). aspect <= 0 = jos nepoznat. */
    function aspectSize(mode, fw, fh, aspect) {
        if (mode === '16_9') aspect = 16 / 9;
        else if (mode === '4_3') aspect = 4 / 3;
        if (mode === 'stretch' || !(aspect > 0)) return [fw, fh];
        var fitW, fitH;
        if (aspect > fw / fh) { fitW = fw; fitH = fw / aspect; } else { fitH = fh; fitW = fh * aspect; }
        var cover = Math.max(fw / fitW, fh / fitH);
        var k = mode === 'zoom' ? cover : (mode === 'fill' ? Math.min(cover, 1 / (1 - 2 * SAFE_CROP)) : 1);
        return [Math.round(fitW * k), Math.round(fitH * k)];
    }
    App.aspectSize = aspectSize;

    /* ======================= HTML5 <video> ======================= */
    function Html5Engine(layer) {
        var v = document.createElement('video');
        v.id = 'av';
        v.setAttribute('preload', 'auto');
        v.setAttribute('playsinline', '');
        layer.appendChild(v);
        this.el = v;
        this.id = 'html5';
        this.ratios = RATIOS.html5;
        this.cb = {};
        var self = this;
        v.addEventListener('playing', function () { self.fire('playing'); });
        v.addEventListener('pause', function () { self.fire('paused'); });
        v.addEventListener('waiting', function () { self.fire('buffering'); });
        v.addEventListener('ended', function () { self.fire('ended'); });
        v.addEventListener('error', function () { if (self.url) self.fire('error'); });
        v.addEventListener('loadedmetadata', function () {
            if (self.startAt > 0) { try { v.currentTime = self.startAt; } catch (e) { } self.startAt = 0; }
            self.applyGeom();
            self.fire('ready');
        });
        v.addEventListener('resize', function () { self.applyGeom(); });
        this.frame = [0, 0, 0, 0];
        this.mode = 'fit';
        v.addEventListener('timeupdate', function () { self.fire('time'); });
    }
    Html5Engine.prototype = {
        on: function (cb) { this.cb = cb || {}; },
        fire: function (ev) { if (this.cb[ev]) this.cb[ev](); },
        open: function (url, opts) {
            var v = this.el;
            this.url = url;
            this.startAt = (opts && opts.start) || 0;
            try { v.pause(); } catch (e) { }
            v.removeAttribute('src');
            while (v.firstChild) v.removeChild(v.firstChild);
            var s = document.createElement('source');
            // Bez `type`: webOS sam prepozna TS/HLS (kao dosadasnja LG aplikacija).
            s.src = url;
            var self = this;
            s.addEventListener('error', function () { if (self.url) self.fire('error'); });
            v.appendChild(s);
            try { v.load(); } catch (e) { }
            var p = v.play();
            if (p && p['catch']) p['catch'](function () { });
        },
        stop: function () {
            var v = this.el;
            this.url = '';
            try { v.pause(); } catch (e) { }
            v.removeAttribute('src');
            while (v.firstChild) v.removeChild(v.firstChild);
            try { v.load(); } catch (e) { }
        },
        pause: function () { try { this.el.pause(); } catch (e) { } },
        resume: function () { try { var p = this.el.play(); if (p && p['catch']) p['catch'](function () { }); } catch (e) { } },
        isPlaying: function () { return !this.el.paused && !this.el.ended; },
        time: function () { return this.el.currentTime || 0; },
        duration: function () {
            var d = this.el.duration;
            return (isFinite(d) && d > 0) ? d : 0;
        },
        seek: function (sec) { try { this.el.currentTime = Math.max(0, sec); } catch (e) { } },
        setRect: function (x, y, w, h) {
            this.frame = [x, y, w, h];
            this.applyGeom();
        },
        setRatio: function (mode) { this.mode = mode; this.applyGeom(); },
        /** Velicina <video> prema nacinu; #video-layer reze sve izvan ekrana. */
        applyGeom: function () {
            var f = this.frame, s = this.el.style, v = this.el;
            var aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 0;
            var mode = this.mode || 'fit';
            if (!(f[2] > 0 && f[3] > 0) || mode === 'fit' || mode === 'auto' || (!aspect && mode !== 'stretch' && mode !== '16_9' && mode !== '4_3')) {
                s.left = f[0] + 'px'; s.top = f[1] + 'px'; s.width = f[2] + 'px'; s.height = f[3] + 'px';
                s.objectFit = 'contain';
                return;
            }
            var wh = aspectSize(mode, f[2], f[3], aspect);
            s.left = Math.round(f[0] + (f[2] - wh[0]) / 2) + 'px';
            s.top = Math.round(f[1] + (f[3] - wh[1]) / 2) + 'px';
            s.width = wh[0] + 'px'; s.height = wh[1] + 'px';
            s.objectFit = 'fill';
        },
        tracks: function (kind) {
            var out = [];
            var list = kind === 'audio' ? this.el.audioTracks : this.el.textTracks;
            if (!list) return out;
            for (var i = 0; i < list.length; i++) {
                var tr = list[i];
                out.push({ index: i, label: tr.label || tr.language || ((kind === 'audio' ? 'Audio ' : 'Sub ') + (i + 1)), on: kind === 'audio' ? tr.enabled : tr.mode === 'showing' });
            }
            return out;
        },
        setTrack: function (kind, idx) {
            var list = kind === 'audio' ? this.el.audioTracks : this.el.textTracks;
            if (!list) return;
            for (var i = 0; i < list.length; i++) {
                if (kind === 'audio') list[i].enabled = (i === idx);
                else list[i].mode = (i === idx) ? 'showing' : 'disabled';
            }
        },
        suspend: function () { this.pause(); },
        restore: function () { if (this.url) this.resume(); }
    };

    /* ======================= Samsung AVPlay ======================= */
    function AvplayEngine(layer) {
        var o = document.createElement('object');
        o.id = 'av';
        o.setAttribute('type', 'application/avplayer');
        layer.appendChild(o);
        this.el = o;
        this.id = 'avplay';
        this.ratios = RATIOS.avplay;
        this.cb = {};
        this.rect = [0, 0, 1920, 1080];
        this.ratio = 'fit';
        this.token = 0;
    }
    AvplayEngine.prototype = {
        av: function () { return window.webapis && window.webapis.avplay; },
        on: function (cb) { this.cb = cb || {}; },
        fire: function (ev, a) { if (this.cb[ev]) this.cb[ev](a); },
        state: function () { try { return this.av().getState(); } catch (e) { return 'NONE'; } },
        open: function (url, opts) {
            var av = this.av();
            var self = this;
            var token = ++this.token;
            this.url = url;
            this.subText('');
            if (!av) { setTimeout(function () { self.fire('error'); }, 0); return; }
            try { av.stop(); } catch (e) { }
            try { av.close(); } catch (e) { }
            try {
                av.open(url);
                av.setListener({
                    onbufferingstart: function () { if (token === self.token) self.fire('buffering'); },
                    onbufferingcomplete: function () { if (token === self.token) self.fire('playing'); },
                    onstreamcompleted: function () { if (token === self.token) self.fire('ended'); },
                    oncurrentplaytime: function () { if (token === self.token) self.fire('time'); },
                    onerror: function () { if (token === self.token) self.fire('error'); },
                    onevent: function () { },
                    onsubtitlechange: function (dur, text) { if (token === self.token) self.subText(text); },
                    ondrmevent: function () { }
                });
                this.applyRect();
                this.applyRatio();
                try { av.setTimeoutForBuffering && av.setTimeoutForBuffering(15); } catch (e) { }
                av.prepareAsync(function () {
                    if (token !== self.token) return;
                    var start = (opts && opts.start) || 0;
                    try { av.play(); } catch (e) { self.fire('error'); return; }
                    if (start > 0) { try { av.seekTo(Math.floor(start * 1000)); } catch (e) { } }
                    self.fire('ready');
                    self.fire('playing');
                }, function () {
                    if (token === self.token) self.fire('error');
                });
            } catch (e) {
                setTimeout(function () { if (token === self.token) self.fire('error'); }, 0);
            }
        },
        stop: function () {
            this.token++;
            this.url = '';
            this.subText('');
            var av = this.av();
            if (!av) return;
            try { av.stop(); } catch (e) { }
            try { av.close(); } catch (e) { }
        },
        pause: function () { try { this.av().pause(); this.fire('paused'); } catch (e) { } },
        resume: function () { try { this.av().play(); this.fire('playing'); } catch (e) { } },
        isPlaying: function () { return this.state() === 'PLAYING'; },
        time: function () { try { return this.av().getCurrentTime() / 1000; } catch (e) { return 0; } },
        duration: function () {
            try {
                var d = this.av().getDuration() / 1000;
                return (d > 0 && d < 86400 * 2) ? d : 0;
            } catch (e) { return 0; }
        },
        seek: function (sec) {
            var self = this;
            try { this.av().seekTo(Math.max(0, Math.floor(sec * 1000)), function () { }, function () { self.fire('error'); }); } catch (e) { }
        },
        setRect: function (x, y, w, h) {
            var s = this.el.style;
            s.left = x + 'px'; s.top = y + 'px'; s.width = w + 'px'; s.height = h + 'px';
            this.rect = [x, y, w, h];
            this.applyRect();
        },
        applyRect: function () {
            var st = this.state();
            if (st === 'NONE') return;
            var r = this.rect;
            // 16:9 / 4:3: prisilni omjer = FULL_SCREEN u centriranom pravokutniku tog omjera.
            if (this.ratio === '16_9' || this.ratio === '4_3') {
                var wh = aspectSize(this.ratio, r[2], r[3], 0);
                r = [Math.round(r[0] + (r[2] - wh[0]) / 2), Math.round(r[1] + (r[3] - wh[1]) / 2), wh[0], wh[1]];
            }
            try { this.av().setDisplayRect(r[0], r[1], r[2], r[3]); } catch (e) { }
        },
        setRatio: function (mode) { this.ratio = mode; this.applyRatio(); this.applyRect(); },
        applyRatio: function () {
            var m = { fit: 'PLAYER_DISPLAY_MODE_LETTER_BOX', stretch: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', auto: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO',
                '16_9': 'PLAYER_DISPLAY_MODE_FULL_SCREEN', '4_3': 'PLAYER_DISPLAY_MODE_FULL_SCREEN' }[this.ratio] || 'PLAYER_DISPLAY_MODE_LETTER_BOX';
            try { this.av().setDisplayMethod(m); } catch (e) { }
        },
        tracks: function (kind) {
            var out = [];
            var type = kind === 'audio' ? 'AUDIO' : 'TEXT';
            try {
                var all = this.av().getTotalTrackInfo();
                var cur = this.av().getCurrentStreamInfo ? this.av().getCurrentStreamInfo() : [];
                var curIdx = -1;
                for (var c = 0; c < cur.length; c++) if (cur[c].type === type) curIdx = cur[c].index;
                for (var i = 0; i < all.length; i++) {
                    if (all[i].type !== type) continue;
                    var info = {};
                    try { info = JSON.parse(all[i].extra_info); } catch (e) { }
                    var lang = (info.language || info.track_lang || '').trim();
                    out.push({ index: all[i].index, label: lang || ((kind === 'audio' ? 'Audio ' : 'Sub ') + (out.length + 1)), on: all[i].index === curIdx });
                }
            } catch (e) { }
            return out;
        },
        setTrack: function (kind, idx) {
            var av = this.av();
            try {
                if (kind === 'text') {
                    if (idx < 0) { av.setSilentSubtitle(true); this.subText(''); return; }
                    av.setSilentSubtitle(false);
                    av.setSelectTrack('TEXT', idx);
                } else {
                    av.setSelectTrack('AUDIO', idx);
                }
            } catch (e) { }
        },
        subText: function (text) {
            var el = U.byId('sub-text');
            if (el) el.innerHTML = text ? U.esc(text).replace(/\n/g, '<br>') : '';
        },
        suspend: function () { try { this.av().suspend(); } catch (e) { } },
        restore: function () { try { this.av().restore(); } catch (e) { } }
    };

    App.Engines = { html5: Html5Engine, avplay: AvplayEngine };

    /* ======================= kontroler ======================= */
    var P = App.Player = {
        engine: null,
        media: null,
        state: 'idle',      // idle | loading | playing | paused | error | ended
        listeners: [],
        full: false,
        attempt: 0,
        lastTime: 0,

        init: function () {
            var ids = App.Platform.engines.map(function (e) { return e.id; });
            var id = App.Settings.get('engine');
            if (ids.indexOf(id) < 0) id = ids[0];
            P.create(id);
            document.addEventListener('visibilitychange', function () {
                if (!P.engine) return;
                if (document.hidden) { P.saveResume(); P.engine.suspend(); }
                else P.engine.restore();
            });
            setInterval(P.saveResume, 10000);
        },
        create: function (id) {
            var layer = U.byId('video-layer');
            if (P.engine) { P.engine.stop(); if (P.engine.el.parentNode) P.engine.el.parentNode.removeChild(P.engine.el); }
            var E = App.Engines[id] || App.Engines.html5;
            P.engine = new E(layer);
            P.engine.on({
                ready: function () { P.emit('ready'); },
                playing: function () { P.attempt = 0; clearTimeout(P.stallTimer); P.setState('playing'); },
                paused: function () { clearTimeout(P.stallTimer); P.setState('paused'); },
                buffering: function () {
                    if (P.state === 'paused' || P.state === 'reconnecting') return;
                    P.setState('loading');
                    // Stream koji "visi" bez greske: nakon 20 s isto kao prekid (ponovno spajanje).
                    var m = P.media;
                    clearTimeout(P.stallTimer);
                    P.stallTimer = setTimeout(function () { if (P.media === m && m && P.state === 'loading') P.onError(); }, 20000);
                },
                ended: function () { P.saveResume(true); P.setState('ended'); },
                error: function () { P.onError(); },
                time: function () { var tm = P.engine.time(); if (tm > 0) P.lastTime = tm; P.emit('time'); }
            });
            P.hideVideo();
        },
        engineId: function () { return P.engine ? P.engine.id : ''; },
        on: function (fn) { P.listeners.push(fn); return function () { var i = P.listeners.indexOf(fn); if (i >= 0) P.listeners.splice(i, 1); }; },
        emit: function (ev) { for (var i = 0; i < P.listeners.length; i++) { try { P.listeners[i](ev, P); } catch (e) { U.log(e); } } },
        setState: function (s) { if (P.state === s) return; P.state = s; P.emit('state'); },

        /**
         * media: {kind 'live'|'catchup'|'vod'|'episode', item, url, title, start (s), resumeKey {kind,id}}
         */
        play: function (media) {
            P.saveResume();
            P.media = media;
            P.attempt = 0;
            clearTimeout(P.stallTimer);
            P.lastTime = media.start || 0;
            clearTimeout(P.retryTimer);
            P.setState('loading');
            P.engine.open(media.url, { start: media.start || 0 });
            P.engine.setRatio(P.full ? P.ratioMode() : 'fit');
            P.emit('media');
        },
        reopen: function () {
            if (!P.media) return;
            P.attempt = 0;
            P.setState('loading');
            P.engine.open(P.media.url, { start: P.media.kind === 'vod' || P.media.kind === 'episode' ? P.engine.time() : 0 });
        },
        stop: function () {
            P.saveResume();
            clearTimeout(P.retryTimer);
            clearTimeout(P.stallTimer);
            P.media = null;
            if (P.engine) P.engine.stop();
            P.setState('idle');
            P.hideVideo();
            P.emit('media');
        },
        /**
         * Prekid / greska streama: do 3 automatska ponovna spajanja (1 s, 2 s, 4 s), film/epizoda od
         * zadnje pozicije; tek onda jasna poruka umjesto crnog ekrana (Android 2.2.6).
         */
        MAX_RETRY: 3,
        reconnectText: function () {
            return t('play_reconnecting', 'Reconnecting\u2026 (%1/%2)').replace('%1', P.attempt).replace('%2', P.MAX_RETRY);
        },
        onError: function () {
            var m = P.media;
            clearTimeout(P.stallTimer);
            if (!m) { P.setState('error'); return; }
            if (P.attempt < P.MAX_RETRY) {
                P.attempt++;
                P.setState('reconnecting');
                P.emit('reconnect');
                var media = m, at = P.lastTime;
                clearTimeout(P.retryTimer);
                P.retryTimer = setTimeout(function () {
                    if (P.media !== media) return;
                    var vod = media.kind === 'vod' || media.kind === 'episode';
                    P.engine.open(media.url, { start: vod ? at : 0 });
                    if (P.full) P.engine.setRatio(P.ratioMode());
                }, 1000 * Math.pow(2, P.attempt - 1));
                return;
            }
            P.setState('error');
        },
        toggle: function () {
            if (!P.media) return;
            if (P.engine.isPlaying()) { P.engine.pause(); P.setState('paused'); }
            else { P.engine.resume(); P.setState('playing'); }
        },
        isPlaying: function () { return P.engine && P.engine.isPlaying(); },
        time: function () { return P.engine ? P.engine.time() : 0; },
        duration: function () { return P.engine ? P.engine.duration() : 0; },
        seek: function (sec) { if (P.engine) P.engine.seek(sec); },

        /** Pravokutnik u px (1920x1080). */
        setRect: function (x, y, w, h) {
            P.full = false;
            P.engine.el.classList.remove('full');
            P.engine.setRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
            P.engine.setRatio('fit');
        },
        setFull: function () {
            P.full = true;
            P.engine.el.classList.add('full');
            P.engine.setRect(0, 0, 1920, 1080);
            P.engine.setRatio(P.ratioMode());
        },
        hideVideo: function () {
            P.full = false;
            if (!P.engine) return;
            P.engine.el.classList.remove('full');
            P.engine.setRect(0, 0, 0, 0);
        },
        ratioModes: function () { return P.engine ? P.engine.ratios : ['fit']; },
        /** Zapamceni nacin (po imenu); ako ga engine nema, njegov zadani (prvi). */
        ratioMode: function () {
            var modes = P.ratioModes();
            var m = App.Settings.get('ratio_mode');
            return modes.indexOf(m) >= 0 ? m : modes[0];
        },
        setRatioMode: function (m) {
            App.Settings.set('ratio_mode', m);
            if (P.full) P.engine.setRatio(m);
            App.toast(P.ratioLabel(m), 1800);
        },
        ratioLabel: function (m) {
            var key = { fill: 'ratio_safe_fill', '16_9': 'ratio_16_9', '4_3': 'ratio_4_3' }[m] || ('ratio_' + m);
            return t('picture', 'Picture') + ': ' + t(key, m);
        },
        /** Sljedeci nacin (tipka za omjer bez dijaloga). */
        nextRatio: function () {
            var modes = P.ratioModes();
            P.setRatioMode(modes[(modes.indexOf(P.ratioMode()) + 1) % modes.length]);
        },

        /** Pozicija nastavka za filmove i epizode (kao Android "Resume"). */
        saveResume: function (ended) {
            var m = P.media;
            if (!m || !m.resumeKey || !P.engine) return;
            var d = P.engine.duration();
            var t0 = P.engine.time();
            if (ended) { App.Lib.setResume(m.resumeKey.kind, m.resumeKey.id, 0, d); return; }
            if (!d || !t0) return;
            App.Lib.setResume(m.resumeKey.kind, m.resumeKey.id, t0, d);
        },

        /** URL streama prema postavci formata (TS / HLS). */
        liveUrl: function (ch) {
            if (ch.url) return ch.url;
            var ext = App.Settings.get('stream_format') === 'm3u8' ? 'm3u8' : 'ts';
            return App.Xtream.streamUrl('live', ch.id, ext);
        }
    };
})();
