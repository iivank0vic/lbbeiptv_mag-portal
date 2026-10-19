/*
 * Backend (app-api-v4) i Xtream Codes API. Endpointi su isti kao na Androidu
 * (playlist_information, get_app_setting, player_api.php).
 */
(function () {
    var WEB = 'https://lbbeiptv.com';

    var Api = App.Api = {
        WEB: WEB,
        ACTIVATE_URL: WEB + '/activate',
        MYLIST_URL: WEB + '/mylist',
        SUPPORT_URL: WEB + '/support',

        panel: function () { return App.Platform.panelUrl; },

        /**
         * Dodatni parametri prijave uredaja (samo platforme koje ih imaju, npr. MAG: serijski broj + token),
         * da sama MAC adresa nije dovoljna za dohvat playliste.
         */
        authQuery: function () {
            var q = App.Platform.authQuery ? App.Platform.authQuery() : '';
            // panelUrl moze vec imati query (MAG PHP proxy: api/?r=...), onda ide '&'.
            return q ? (Api.panel().indexOf('?') >= 0 ? '&' : '?') + q : '';
        },

        /**
         * Tajni kljuc uredaja (API-SECURITY.md): 32 nasumicna bajta kao 64 hex znaka, nastaje jednom i
         * ostaje na uredaju. MAC je javan; playliste server daje samo uz MAC + ovaj kljuc.
         * Nikad se ne prikazuje i ne logira. Platforma moze imati svoju trajniju pohranu (deviceKeyStore).
         */
        deviceKey: function () {
            if (Api._key) return Api._key;
            var store = App.Platform.deviceKeyStore || {
                load: function () { try { return window.localStorage.getItem('lbbe_device_key'); } catch (e) { return null; } },
                save: function (v) { try { window.localStorage.setItem('lbbe_device_key', v); } catch (e) { } }
            };
            var k = String(store.load() || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
            if (k.length !== 64) {
                k = randomHex(32);
                store.save(k);
            }
            Api._key = k;
            return k;
        },
        headers: function () {
            return {
                'X-Device-Key': Api.deviceKey(),
                'X-App-Platform': App.Platform.name,
                'X-App-Version': App.Platform.version
            };
        },
        /**
         * GET prema portalu s headerima uredaja. Ako zahtjev s headerima uopce ne prode (status 0:
         * stari runtime / proxy bez CORS-a za custom headere), jednom bez njih — 403 se nikad ne zaobilazi.
         */
        portalGet: function (path, timeout) {
            var url = Api.panel() + path + Api.authQuery();
            if (Api.noHeaders) return U.getJSON(url, timeout);
            return U.getJSON(url, timeout, Api.headers()).then(null, function (err) {
                if (err && err.status === 0 && !err.timeout) {
                    return U.getJSON(url, timeout).then(function (d) { Api.noHeaders = true; return d; });
                }
                throw err;
            });
        },
        /** 401/403 {"error":"pairing_required","pairing_code":"482913"} -> {code} ili null. */
        pairingFrom: function (err) {
            if (!err || (err.status !== 401 && err.status !== 403)) return null;
            var d = err.data;
            if (d && d.error === 'pairing_required') return { code: d.pairing_code ? String(d.pairing_code) : '' };
            return null;
        },

        /** {mac_registered, urls[], expire_date, is_trial, languages[]} */
        playlistInformation: function (mac) {
            return Api.portalGet('/playlist_information/' + encodeURIComponent(mac), 20000).then(function (data) {
                if (!data || typeof data !== 'object') throw { status: 0, statusText: 'parse', parse: true };
                return data;
            });
        },
        appSetting: function (mac) {
            return Api.portalGet('/get_app_setting/' + encodeURIComponent(mac), 15000);
        },
        /** Link za potvrdu uredaja (kod s portala, ne platformski pairCode). */
        pairingUrl: function (mac, code) {
            return Api.MYLIST_URL + '?mac=' + encodeURIComponent(mac || '').replace(/%3A/gi, ':') + (code ? '&code=' + encodeURIComponent(code) : '');
        },
        withMac: function (url, mac) {
            var out = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'mac=' + encodeURIComponent(mac || '').replace(/%3A/gi, ':');
            var code = Api.pairCode();
            if (code) out += '&code=' + encodeURIComponent(code);
            return out;
        },
        /** Kod za aktivaciju prikazan samo na ekranu uredaja (platforme koje ga imaju). */
        pairCode: function () {
            return App.Platform.pairCode ? App.Platform.pairCode() : '';
        }
    };

    /** n nasumicnih bajtova kao hex (crypto ako postoji; inace Math.random pomijesan s vremenom). */
    function randomHex(n) {
        var hex = '0123456789abcdef', out = '', rnd = null;
        try {
            if (window.crypto && window.crypto.getRandomValues && typeof Uint8Array !== 'undefined') {
                rnd = new Uint8Array(n);
                window.crypto.getRandomValues(rnd);
            }
        } catch (e) { rnd = null; }
        var t = new Date().getTime();
        for (var i = 0; i < n; i++) {
            var b = rnd ? rnd[i] : (Math.floor(Math.random() * 256) ^ ((t >> ((i % 4) * 8)) & 255) ^ Math.floor(Math.random() * 256)) & 255;
            out += hex.charAt(b >> 4) + hex.charAt(b & 15);
        }
        return out;
    }
    App.randomHex = randomHex;

    /**
     * Xtream racun iz URL-a playliste. Prepoznaje get.php / player_api.php s username i password
     * parametrima (i `/username/password` oblik nije podrzan kao Xtream — to je obican M3U).
     */
    var Xtream = App.Xtream = {
        server: '', username: '', password: '',

        parse: function (url) {
            if (!url) return null;
            var q = url.split('?');
            if (q.length < 2) return null;
            var params = {};
            q[1].split('&').forEach(function (part) {
                var i = part.indexOf('=');
                if (i < 0) return;
                var k = part.substr(0, i).toLowerCase();
                var v = part.substr(i + 1);
                try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { }
                params[k] = v;
            });
            if (!params.username || !params.password) return null;
            var base = q[0].replace(/\/(get|player_api|xmltv)\.php$/i, '').replace(/\/+$/, '');
            var m = base.match(/^(https?:\/\/[^\/]+)/i);
            if (!m) return null;
            return { server: base, username: params.username, password: params.password };
        },
        set: function (acc) {
            Xtream.server = acc.server;
            Xtream.username = acc.username;
            Xtream.password = acc.password;
        },
        api: function (action, extra) {
            var url = Xtream.server + '/player_api.php?username=' + encodeURIComponent(Xtream.username) +
                '&password=' + encodeURIComponent(Xtream.password);
            if (action) url += '&action=' + action;
            if (extra) url += extra;
            return url;
        },
        get: function (action, extra, timeout) {
            return U.getJSON(Xtream.api(action, extra), timeout || 60000);
        },
        streamUrl: function (kind, id, ext) {
            return Xtream.server + '/' + kind + '/' + encodeURIComponent(Xtream.username) + '/' +
                encodeURIComponent(Xtream.password) + '/' + id + (ext ? '.' + ext : '');
        },
        /** start = "YYYY-MM-DD HH:MM[:SS]" u vremenu servera (kako ga vraca EPG). */
        timeshiftUrl: function (streamId, startServerUtcMs, durationMin) {
            var d = new Date(startServerUtcMs);
            var start = d.getUTCFullYear() + '-' + U.pad2(d.getUTCMonth() + 1) + '-' + U.pad2(d.getUTCDate()) + ':' +
                U.pad2(d.getUTCHours()) + '-' + U.pad2(d.getUTCMinutes());
            return Xtream.server + '/streaming/timeshift.php?username=' + encodeURIComponent(Xtream.username) +
                '&password=' + encodeURIComponent(Xtream.password) + '&stream=' + streamId +
                '&start=' + start + '&duration=' + Math.max(1, Math.round(durationMin));
        },
        shortEpg: function (streamId, limit) {
            return Xtream.get('get_short_epg', '&stream_id=' + streamId + '&limit=' + (limit || 6), 15000)
                .then(function (d) { return Xtream.mapEpg(d); });
        },
        fullEpg: function (streamId) {
            return Xtream.get('get_simple_data_table', '&stream_id=' + streamId, 30000)
                .then(function (d) { return Xtream.mapEpg(d); });
        },
        vodInfo: function (id) { return Xtream.get('get_vod_info', '&vod_id=' + id, 20000); },
        seriesInfo: function (id) { return Xtream.get('get_series_info', '&series_id=' + id, 30000); },

        /**
         * EPG -> [{title, desc, start (UTC ms), end (UTC ms), serverStart (ms, "lokalno" vrijeme servera
         * zapisano kao UTC), hasArchive}]. start/end iz *_timestamp polja (UTC), a serverStart iz
         * tekstualnog `start` (vrijeme servera) — tako catch-up URL ne ovisi o vremenskoj zoni TV-a.
         */
        mapEpg: function (d) {
            var list = d && (d.epg_listings || d.listings) ? (d.epg_listings || d.listings) : [];
            list = U.toArray(list);
            var out = [];
            for (var i = 0; i < list.length; i++) {
                var e = list[i];
                var st = parseInt(e.start_timestamp, 10) * 1000;
                var en = parseInt(e.stop_timestamp || e.end_timestamp, 10) * 1000;
                if (isNaN(st)) st = U.parseDateUTC(e.start);
                if (isNaN(en)) en = U.parseDateUTC(e.end || e.stop);
                if (isNaN(st) || isNaN(en)) continue;
                var serverStart = U.parseDateUTC(e.start);
                if (isNaN(serverStart)) serverStart = st;
                out.push({
                    title: U.b64(e.title) || '',
                    desc: U.b64(e.description) || '',
                    start: st,
                    end: en,
                    serverStart: serverStart,
                    hasArchive: e.has_archive == 1 || e.has_archive === '1' || e.has_archive === true
                });
            }
            out.sort(function (a, b) { return a.start - b.start; });
            // Duplikati (neki serveri vracaju isti program dvaput).
            var res = [];
            for (var j = 0; j < out.length; j++) {
                if (j > 0 && out[j].start === out[j - 1].start) continue;
                res.push(out[j]);
            }
            return res;
        }
    };
})();
