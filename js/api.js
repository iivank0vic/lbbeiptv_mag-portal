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

        /** {mac_registered, urls[], expire_date, is_trial, languages[]} */
        /**
         * Dodatni parametri prijave uredaja (samo platforme koje ih imaju, npr. MAG: serijski broj + token),
         * da sama MAC adresa nije dovoljna za dohvat playliste.
         */
        authQuery: function () {
            var q = App.Platform.authQuery ? App.Platform.authQuery() : '';
            return q ? '?' + q : '';
        },
        playlistInformation: function (mac) {
            return U.getJSON(Api.panel() + '/playlist_information/' + encodeURIComponent(mac) + Api.authQuery(), 20000).then(function (data) {
                if (!data || typeof data !== 'object') throw { status: 0, statusText: 'parse', parse: true };
                return data;
            });
        },
        appSetting: function (mac) {
            return U.getJSON(Api.panel() + '/get_app_setting/' + encodeURIComponent(mac) + Api.authQuery(), 15000);
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
