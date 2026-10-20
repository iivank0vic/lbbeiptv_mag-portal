/*
 * EPG za M3U playliste (XMLTV): adresa iz zaglavlja `#EXTM3U url-tvg="..."` / `x-tvg-url` (moze ih biti vise,
 * odvojenih zarezom), a za Xtream / XUI ONE link ucitan kao M3U `xmltv.php` istog servera.
 * .gz se raspakira (js/lib/pako_inflate). Zadrzavaju se samo kanali iz playliste i programi od -4 h do +30 h,
 * kopija ide u IndexedDB i vrijedi 12 h. Ucitava se u pozadini nakon starta i nikad ne blokira aplikaciju.
 * Kanal se spaja po tvg-id, a ako ga nema po imenu (display-name). U MAG lite nacinu je iskljuceno.
 */
(function () {
    var TTL = 12 * 3600000, PAST = 4 * 3600000, AHEAD = 30 * 3600000;
    var listeners = [];

    var E = App.XmlEpg = {
        state: 'idle',      // idle | loading | ready | none
        data: null,         // {byId: {xmlId: [[start, end, title, desc]]}, ids: {lower: xmlId}, names: {norm: xmlId}}
        loadId: 0,

        onChange: function (fn) { listeners.push(fn); },
        emit: function () { for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) { U.log(e); } } },

        /** Adrese EPG-a za trenutnu M3U listu (prazno = nema EPG-a). */
        urls: function () {
            var L = App.Lib, out = [];
            (L.epgUrls || []).forEach(function (u) { if (/^https?:\/\//i.test(u) && out.indexOf(u) < 0) out.push(u); });
            if (!out.length) {
                var acc = App.Xtream.parse(L.url);
                if (acc) out.push(acc.server + '/xmltv.php?username=' + encodeURIComponent(acc.username) + '&password=' + encodeURIComponent(acc.password));
            }
            return out;
        },

        reset: function () { E.loadId++; E.state = 'idle'; E.data = null; },

        /** Pozadinsko ucitavanje nakon ucitane playliste. */
        load: function () {
            E.reset();
            var id = E.loadId;
            if (App.Lib.type !== 'm3u' || (App.Platform && App.Platform.lite) || !App.Lib.live.items.length) { E.state = 'none'; return Promise.resolve(); }
            var urls = E.urls();
            if (!urls.length) { E.state = 'none'; return Promise.resolve(); }
            E.state = 'loading';
            var key = 'epg_' + U.hash(urls.join('|') + '|' + App.Lib.key);
            return App.Cache.getEpg(key).then(function (rec) {
                if (id !== E.loadId) return;
                if (rec && rec.data && U.now() - rec.savedAt < TTL) { E.done(id, rec.data, rec.savedAt); return; }
                return E.fetchFirst(urls, 0).then(function (text) {
                    if (id !== E.loadId) return;
                    if (!text || text.indexOf('<tv') < 0) throw { status: 0, statusText: 'not xmltv' };
                    // Vise od ~150 MB teksta TV ne moze sigurno drzati u memoriji.
                    if (text.length > 150 * 1048576) throw { status: 0, statusText: 'xmltv too large' };
                    return E.parse(text, App.Lib.live.items).then(function (data) {
                        if (id !== E.loadId) return;
                        App.Cache.putEpg({ key: key, savedAt: U.now(), data: data });
                        E.done(id, data, U.now());
                    });
                }).then(null, function (err) {
                    U.log('XMLTV failed', err);
                    if (id !== E.loadId) return;
                    // Stara kopija je bolja nego nista.
                    if (rec && rec.data) E.done(id, rec.data, U.now() - TTL + 3600000); else { E.state = 'none'; E.emit(); }
                });
            });
        },
        done: function (id, data, at) {
            if (id !== E.loadId) return;
            E.data = data;
            E.loadedAt = at || U.now();
            E.state = 'ready';
            E.emit();
        },

        fetchFirst: function (urls, i) {
            if (i >= urls.length) return Promise.reject({ status: 0, statusText: 'no epg' });
            return E.fetch(urls[i]).then(null, function () { return E.fetchFirst(urls, i + 1); });
        },
        /** XMLTV kao tekst; gzip (po sadrzaju, ne po imenu) se raspakira. */
        fetch: function (url) {
            return U.http({ url: url, type: 'arraybuffer', timeout: 180000 }).then(function (buf) {
                if (!buf || typeof buf === 'string') return buf || '';
                var u8 = new Uint8Array(buf);
                if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
                    if (!window.pako) throw { status: 0, statusText: 'no inflate' };
                    return window.pako.inflate(u8, { to: 'string' });
                }
                if (window.TextDecoder) return new window.TextDecoder('utf-8').decode(u8);
                return U.http({ url: url, type: 'text', timeout: 180000 });
            });
        },

        /**
         * Parsiranje bez DOM-a (XMLTV zna imati desetke MB): kanali -> koji odgovaraju playlisti, pa samo
         * njihovi programi u vremenskom prozoru. Radi u komadima (~60 ms) da daljinski i video ne zastanu.
         */
        parse: function (text, channels, slice) {
            slice = slice || 60;
            var wantIds = {}, wantNames = {};
            channels.forEach(function (ch) {
                if (ch.epg) wantIds[String(ch.epg).toLowerCase()] = true;
                var n = norm(ch.name), q = norm(stripQuality(ch.name));
                if (n) wantNames[n] = true;
                if (q) wantNames[q] = true;
            });
            var ids = {}, names = {}, keep = {}, any = false, byId = {};
            var reCh = /<channel\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g;
            var reP = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
            var now = U.now(), from = now - PAST, to = now + AHEAD, noChannels = false;

            function channelStep() {
                var m, t0 = U.now(), n = 0;
                while ((m = reCh.exec(text)) !== null) {
                    var xid = xmlText(m[1]);
                    var lower = xid.toLowerCase();
                    var hit = !!wantIds[lower];
                    var reDn = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g, d;
                    while ((d = reDn.exec(m[2])) !== null) {
                        var dn = xmlText(d[1]), k1 = norm(dn), k2 = norm(stripQuality(dn));
                        if (k1 && wantNames[k1]) { hit = true; if (!names[k1]) names[k1] = xid; }
                        if (k2 && wantNames[k2]) { hit = true; if (!names[k2]) names[k2] = xid; }
                    }
                    if (hit) { keep[xid] = true; ids[lower] = xid; any = true; }
                    if (++n % 200 === 0 && U.now() - t0 > slice) return false;
                }
                // XMLTV bez <channel> elemenata: spajanje samo po tvg-id.
                noChannels = !any && text.indexOf('<channel') < 0;
                return true;
            }
            function programmeStep() {
                var m, t0 = U.now(), n = 0;
                while ((m = reP.exec(text)) !== null) {
                    if (++n % 500 === 0 && U.now() - t0 > slice) { reP.lastIndex = m.index; return false; }
                    var at = m[1];
                    var cm = at.match(/\bchannel="([^"]*)"/);
                    if (!cm) continue;
                    var cid = xmlText(cm[1]);
                    if (!keep[cid]) {
                        if (!(noChannels && wantIds[cid.toLowerCase()])) continue;
                        keep[cid] = true; ids[cid.toLowerCase()] = cid;
                    }
                    var sm = at.match(/\bstart="([^"]*)"/), em = at.match(/\bstop="([^"]*)"/);
                    var st = sm ? xmltvTime(sm[1]) : NaN, en = em ? xmltvTime(em[1]) : NaN;
                    if (isNaN(st)) continue;
                    if (isNaN(en)) en = st + 3600000;
                    if (en < from || st > to) continue;
                    var tm = m[2].match(/<title[^>]*>([\s\S]*?)<\/title>/);
                    var dm = m[2].match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
                    (byId[cid] || (byId[cid] = [])).push([st, en, tm ? xmlText(tm[1]) : '', dm ? xmlText(dm[1]).substr(0, 600) : '']);
                }
                return true;
            }
            return new Promise(function (resolve, reject) {
                var phase = 0;
                function run() {
                    try {
                        if (phase === 0 && channelStep()) phase = 1;
                        if (phase === 1 && programmeStep()) {
                            for (var k in byId) if (byId.hasOwnProperty(k)) byId[k].sort(function (a, b) { return a[0] - b[0]; });
                            resolve({ byId: byId, ids: ids, names: names });
                            return;
                        }
                    } catch (e) { reject(e); return; }
                    setTimeout(run, 15);
                }
                run();
            });
        },

        /** [{title, desc, start, end}] za kanal; null dok se EPG jos ucitava. */
        forChannel: function (ch) {
            if (E.state === 'loading' || E.state === 'idle') return null;
            // Aplikacija upaljena dulje od 12 h: osvjezi u pozadini (stari podaci vrijede dok novi ne stignu).
            if (E.state === 'ready' && U.now() - E.loadedAt > TTL && !E.refreshing) {
                E.refreshing = true;
                var old = E.data;
                E.load().then(function () { E.refreshing = false; if (!E.data) { E.data = old; E.state = 'ready'; } });
                E.state = 'ready'; E.data = old;
            }
            var d = E.data;
            if (!d || !ch) return [];
            var xid = (ch.epg && d.ids[String(ch.epg).toLowerCase()]) || d.names[norm(ch.name)] || d.names[norm(stripQuality(ch.name))];
            var list = xid && d.byId[xid];
            if (!list) return [];
            var now = U.now(), out = [];
            for (var i = 0; i < list.length; i++) {
                var p = list[i];
                if (p[1] <= now - 3600000) continue;
                out.push({ start: p[0], end: p[1], title: p[2], desc: p[3], hasArchive: false });
                if (out.length >= 12) break;
            }
            return out;
        }
    };

    function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ''); }
    /** "HRT 1 HD", "Nova TV FHD", "Sport 1 (4K)" -> bez oznake kvalitete. */
    function stripQuality(s) { return String(s || '').replace(/[\s([|_-]+(f?hd|uhd|sd|4k|hevc|h265|1080p?|720p?|50fps|\+)[)\]]?\s*$/i, ''); }
    function xmlText(s) {
        s = String(s || '');
        var cd = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
        if (cd) return cd[1].trim();
        return s.replace(/&#x([0-9a-f]+);/gi, function (a, h) { return String.fromCharCode(parseInt(h, 16)); })
            .replace(/&#(\d+);/g, function (a, n) { return String.fromCharCode(parseInt(n, 10)); })
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .replace(/^\s+|\s+$/g, '');
    }
    /** "20261020083000 +0200" -> UTC ms (bez zone = UTC). */
    function xmltvTime(s) {
        var m = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{2}):?(\d{2}))?/);
        if (!m) return NaN;
        var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        if (m[7]) {
            var sign = m[7].charAt(0) === '-' ? -1 : 1;
            t -= sign * (Math.abs(parseInt(m[7], 10)) * 60 + parseInt(m[8] || '0', 10)) * 60000;
        }
        return t;
    }
    E.xmltvTime = xmltvTime;
    E.norm = norm;
    E.stripQuality = stripQuality;
})();
