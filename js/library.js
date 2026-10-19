/*
 * Postavke + sadrzaj playliste (Live / Movies / Series) + korisnicki podaci
 * (favoriti, recently viewed, pozicija nastavka, skrivene kategorije).
 * Pandan Realm modelima i MyApp upitima u Android aplikaciji.
 */
(function () {
    /* ======================= Postavke ======================= */
    var DEFAULTS = {
        language: '',
        time_format: '24',
        stream_format: 'ts',
        engine: '',
        live_sort: 'default',
        vod_sort: 'added',
        series_sort: 'added',
        pin: '0000',
        playlist_index: -1,
        ratio: 0
    };
    var settings = U.store.get('lbbe_settings', {}) || {};

    App.Settings = {
        get: function (k) { return settings[k] !== undefined ? settings[k] : DEFAULTS[k]; },
        set: function (k, v) { settings[k] = v; U.store.set('lbbe_settings', settings); }
    };

    /* ======================= Posebne kategorije ======================= */
    var FAV = 'fav', RECENT = 'recent', ALL = 'all', NONE = '__none';
    var MAX_RECENT = { live: 30, vod: 40, series: 40 };
    var MAX_FAV = 500;

    function emptyKind() { return { cats: [], items: [], byId: {}, byCat: {} }; }

    var Lib = App.Lib = {
        FAV: FAV, RECENT: RECENT, ALL: ALL,
        type: '',          // 'xtream' | 'm3u'
        url: '',
        key: '',
        userInfo: null,
        serverInfo: null,
        live: emptyKind(), vod: emptyKind(), series: emptyKind(),

        reset: function () {
            Lib.live = emptyKind(); Lib.vod = emptyKind(); Lib.series = emptyKind();
            Lib.userInfo = null; Lib.serverInfo = null;
        },

        /* ---------------- ucitavanje ---------------- */
        /**
         * Ucitava playlistu. progress(textKey, percent).
         * Xtream: player_api; ako API ne radi, pokusava isti URL kao M3U (kao i stari klijent).
         */
        load: function (url, progress) {
            Lib.reset();
            Lib.url = url;
            Lib.key = 'pl_' + U.hash(url);
            progress = progress || function () { };
            var acc = App.Xtream.parse(url);
            if (acc) {
                App.Xtream.set(acc);
                return Lib.loadXtream(progress).then(null, function (err) {
                    if (err && err.fatal) throw err;
                    U.log('Xtream API failed, trying M3U', err);
                    // Rezerva: isti URL kao M3U. Ako ni to ne uspije, prijavi izvornu (Xtream) gresku.
                    return Lib.loadM3u(url, progress).then(null, function () { throw err; });
                });
            }
            return Lib.loadM3u(url, progress);
        },

        loadXtream: function (progress) {
            var X = App.Xtream;
            Lib.type = 'xtream';
            progress('connecting', 8);
            return X.get('', '', 25000).then(function (auth) {
                if (!auth || typeof auth !== 'object') throw { status: 0, parse: true };
                var ui = auth.user_info;
                if (ui && (ui.auth === 0 || ui.auth === '0')) throw { status: 401, fatal: true };
                if (ui && ui.status && /expired|banned|disabled/i.test(ui.status)) throw { status: 403, fatal: true, expired: true };
                Lib.userInfo = ui || null;
                Lib.serverInfo = auth.server_info || null;
                if (!ui && !auth.server_info) throw { status: 0, parse: true };
                progress('loading_live', 20);
                return Promise.all([
                    X.get('get_live_categories').then(null, function () { return []; }),
                    X.get('get_live_streams', '', 90000)
                ]);
            }).then(function (r) {
                Lib.build('live', U.toArray(r[0]), U.toArray(r[1]));
                progress('loading_movies', 45);
                return Promise.all([
                    X.get('get_vod_categories').then(null, function () { return []; }),
                    X.get('get_vod_streams', '', 120000).then(null, function () { return []; })
                ]);
            }).then(function (r) {
                Lib.build('vod', U.toArray(r[0]), U.toArray(r[1]));
                progress('loading_series', 72);
                return Promise.all([
                    X.get('get_series_categories').then(null, function () { return []; }),
                    X.get('get_series', '', 120000).then(null, function () { return []; })
                ]);
            }).then(function (r) {
                Lib.build('series', U.toArray(r[0]), U.toArray(r[1]));
                progress('preparing', 95);
                if (!Lib.live.items.length && !Lib.vod.items.length && !Lib.series.items.length) {
                    throw { status: 0, empty: true, fatal: true };
                }
            });
        },

        loadM3u: function (url, progress) {
            Lib.type = 'm3u';
            progress('connecting', 10);
            return U.http({
                url: url, type: 'text', timeout: 120000,
                onProgress: function (e) {
                    if (e && e.lengthComputable && e.total) progress('loading', 10 + Math.round(60 * e.loaded / e.total));
                }
            }).then(function (text) {
                progress('preparing', 80);
                if (typeof text !== 'string' || text.indexOf('#EXTINF') < 0) throw { status: 0, empty: true, fatal: true };
                Lib.parseM3u(text);
                if (!Lib.live.items.length && !Lib.vod.items.length && !Lib.series.items.length) {
                    throw { status: 0, empty: true, fatal: true };
                }
                progress('preparing', 95);
            });
        },

        /* ---------------- normalizacija ---------------- */
        build: function (kind, rawCats, rawItems) {
            var K = Lib[kind];
            var catMap = {};
            var cats = [];
            rawCats.forEach(function (c) {
                if (!c) return;
                var id = U.str(c.category_id);
                if (id === '' || catMap[id]) return;
                var cat = { id: id, name: U.str(c.category_name) || id, items: [], parent: c.parent_id };
                catMap[id] = cat;
                cats.push(cat);
            });
            var items = new Array(rawItems.length);
            var n = 0;
            for (var i = 0; i < rawItems.length; i++) {
                var r = rawItems[i];
                if (!r) continue;
                var it = kind === 'live' ? mapLive(r, i) : (kind === 'vod' ? mapVod(r, i) : mapSeries(r, i));
                if (!it.id) continue;
                items[n++] = it;
            }
            items.length = n;
            Lib.index(kind, cats, catMap, items);
        },

        index: function (kind, cats, catMap, items) {
            var K = Lib[kind];
            var byId = {};
            var none = null;
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                byId[it.id] = it;
                var cat = catMap[it.cat];
                if (!cat) {
                    // Kategorija koje nema u popisu (ili prazan category_id).
                    if (it.cat && it.cat !== NONE) {
                        cat = { id: it.cat, name: it.cat, items: [] };
                        catMap[it.cat] = cat;
                        cats.push(cat);
                    } else {
                        if (!none) { none = { id: NONE, name: t('uncategorized'), items: [] }; catMap[NONE] = none; }
                        it.cat = NONE;
                        cat = none;
                    }
                }
                cat.items.push(it);
            }
            if (none) cats.push(none);
            K.cats = cats.filter(function (c) { return c.items.length > 0; });
            K.items = items;
            K.byId = byId;
            K.byCat = catMap;
        },

        /* ---------------- M3U ---------------- */
        parseM3u: function (text) {
            var lines = text.split(/\r?\n/);
            var live = [], vod = [], seriesEps = [];
            var cats = { live: {}, vod: {}, series: {} };
            var catList = { live: [], vod: [], series: [] };
            var cur = null, num = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                if (line.indexOf('#EXTINF') === 0) {
                    cur = parseExtinf(line);
                    continue;
                }
                if (line.charAt(0) === '#') {
                    if (cur && line.indexOf('#EXTGRP:') === 0 && !cur.group) cur.group = line.substr(8).trim();
                    continue;
                }
                if (!cur) continue;
                if (!/^(https?|rtmp|rtsp|udp):\/\//i.test(line)) { cur = null; continue; }
                var url = line;
                var kind = 'live';
                if (/\/movie\//i.test(url) || /\.(mp4|mkv|avi|mov|wmv|m4v)(\?|$)/i.test(url)) kind = 'vod';
                if (/\/series\//i.test(url)) kind = 'series';
                var group = cur.group || t('uncategorized');
                if (!cats[kind][group]) {
                    cats[kind][group] = true;
                    catList[kind].push({ category_id: group, category_name: group });
                }
                num++;
                var base = {
                    name: cur.name || cur.tvgName || ('#' + num),
                    icon: cur.logo || '',
                    cat: group,
                    url: url,
                    num: num,
                    epg: cur.tvgId || ''
                };
                if (kind === 'live') {
                    base.id = 'm' + num;
                    base.archive = cur.catchup ? true : false;
                    live.push(base);
                } else if (kind === 'vod') {
                    base.id = 'v' + num;
                    base.ext = (url.match(/\.([a-z0-9]{2,4})(\?|$)/i) || [])[1] || 'mp4';
                    base.added = num;
                    vod.push(base);
                } else {
                    seriesEps.push(base);
                }
                cur = null;
            }
            Lib.indexPlain('live', catList.live, live);
            Lib.indexPlain('vod', catList.vod, vod);
            Lib.indexPlain('series', catList.series, groupSeries(seriesEps));
        },
        indexPlain: function (kind, rawCats, items) {
            var catMap = {}, cats = [];
            rawCats.forEach(function (c) {
                var cat = { id: c.category_id, name: c.category_name, items: [] };
                catMap[cat.id] = cat;
                cats.push(cat);
            });
            Lib.index(kind, cats, catMap, items);
        },

        /* ---------------- upiti ---------------- */
        get: function (kind, id) { return Lib[kind].byId[id] || null; },
        count: function (kind) { return Lib[kind].items.length; },

        /** Kategorije za stupac: Favorites, Recently viewed, All, pa vidljive kategorije playliste. */
        categories: function (kind) {
            var hidden = Lib.hiddenSet(kind);
            var out = [
                { id: FAV, name: t('favorites'), special: true },
                { id: RECENT, name: t('recently_viewed'), special: true },
                { id: ALL, name: t('all'), special: true }
            ];
            Lib[kind].cats.forEach(function (c) { if (!hidden[c.id]) out.push(c); });
            return out;
        },
        allCategories: function (kind) { return Lib[kind].cats; },
        categoryName: function (kind, catId) {
            if (catId === FAV) return t('favorites');
            if (catId === RECENT) return t('recently_viewed');
            if (catId === ALL) return t('all');
            var c = Lib[kind].byCat[catId];
            return c ? c.name : '';
        },
        /** Stavke kategorije, sortirane prema postavci. */
        items: function (kind, catId) {
            var K = Lib[kind];
            var list;
            if (catId === FAV) return Lib.idsToItems(kind, Lib.favIds(kind));
            if (catId === RECENT) return Lib.idsToItems(kind, Lib.recentIds(kind));
            if (catId === ALL) {
                var hidden = Lib.hiddenSet(kind);
                list = [];
                K.cats.forEach(function (c) {
                    if (hidden[c.id] || Lib.isLocked(kind, c)) return;
                    for (var i = 0; i < c.items.length; i++) list.push(c.items[i]);
                });
            } else {
                var cat = K.byCat[catId];
                list = cat ? cat.items.slice() : [];
            }
            return Lib.sort(kind, list);
        },
        countIn: function (kind, catId) {
            if (catId === FAV) return Lib.idsToItems(kind, Lib.favIds(kind)).length;
            if (catId === RECENT) return Lib.idsToItems(kind, Lib.recentIds(kind)).length;
            if (catId === ALL) return Lib[kind].items.length;
            var c = Lib[kind].byCat[catId];
            return c ? c.items.length : 0;
        },
        idsToItems: function (kind, ids) {
            var out = [];
            for (var i = 0; i < ids.length; i++) {
                var it = Lib[kind].byId[ids[i]];
                if (it) out.push(it);
            }
            return out;
        },
        sort: function (kind, list) {
            var key = App.Settings.get(kind === 'live' ? 'live_sort' : (kind === 'vod' ? 'vod_sort' : 'series_sort'));
            var cmp = null;
            if (key === 'a-z') cmp = function (a, b) { return a.name.localeCompare(b.name); };
            else if (key === 'z-a') cmp = function (a, b) { return b.name.localeCompare(a.name); };
            else if (key === 'number') cmp = function (a, b) { return (a.num || 0) - (b.num || 0); };
            else if (key === 'rating') cmp = function (a, b) { return (b.rating || 0) - (a.rating || 0); };
            else if (key === 'added') cmp = function (a, b) { return (b.added || 0) - (a.added || 0); };
            if (!cmp) return list;
            // Stabilno sortiranje (Array.sort na starim V8 nije stabilan).
            var idx = list.map(function (it, i) { return { it: it, i: i }; });
            idx.sort(function (a, b) { var r = cmp(a.it, b.it); return r !== 0 ? r : a.i - b.i; });
            return idx.map(function (x) { return x.it; });
        },
        latest: function (kind, n) {
            var list = Lib[kind].items.filter(function (it) { return !Lib.isLockedItem(kind, it); });
            list = list.slice().sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
            return list.slice(0, n);
        },
        search: function (kind, q, limit) {
            q = U.norm(q).trim();
            if (!q) return [];
            var words = q.split(/\s+/);
            var out = [];
            var items = Lib[kind].items;
            for (var i = 0; i < items.length && out.length < (limit || 300); i++) {
                var it = items[i];
                if (Lib.isLockedItem(kind, it)) continue;
                var n = it._n || (it._n = U.norm(it.name));
                var ok = true;
                for (var w = 0; w < words.length; w++) if (n.indexOf(words[w]) < 0) { ok = false; break; }
                if (ok) out.push(it);
            }
            return out;
        },

        /* ---------------- roditeljska zastita ---------------- */
        isLocked: function (kind, cat) {
            if (!cat || cat.special) return false;
            var n = String(cat.name || '').toLowerCase();
            return n.indexOf('adult') >= 0 || n.indexOf('xxx') >= 0 || n.indexOf('porn') >= 0 || n.indexOf('18+') >= 0;
        },
        isLockedItem: function (kind, it) {
            var cat = Lib[kind].byCat[it.cat];
            return Lib.isLocked(kind, cat);
        },

        /* ---------------- korisnicki podaci (po playlisti) ---------------- */
        k: function (kind, what) { return Lib.key + ':' + kind + ':' + what; },
        favIds: function (kind) { return U.store.get(Lib.k(kind, 'fav'), []); },
        isFav: function (kind, id) { return U.store.peek(Lib.k(kind, 'fav'), []).indexOf(id) >= 0; },
        toggleFav: function (kind, id) {
            var ids = Lib.favIds(kind);
            var i = ids.indexOf(id);
            if (i >= 0) ids.splice(i, 1); else ids.unshift(id);
            if (ids.length > MAX_FAV) ids.length = MAX_FAV;
            U.store.set(Lib.k(kind, 'fav'), ids);
            return i < 0;
        },
        recentIds: function (kind) { return U.store.get(Lib.k(kind, 'recent'), []); },
        pushRecent: function (kind, id) {
            var ids = Lib.recentIds(kind);
            var i = ids.indexOf(id);
            if (i >= 0) ids.splice(i, 1);
            ids.unshift(id);
            if (ids.length > MAX_RECENT[kind]) ids.length = MAX_RECENT[kind];
            U.store.set(Lib.k(kind, 'recent'), ids);
        },
        /** Pozicija nastavka: {p: sekunde, d: trajanje, t: kada}. */
        getResume: function (kind, id) {
            var all = U.store.peek(Lib.k(kind, 'resume'), {});
            return all[id] || null;
        },
        setResume: function (kind, id, pos, dur) {
            var all = U.store.get(Lib.k(kind, 'resume'), {});
            if (!pos || pos < 30 || (dur && pos > dur - 60)) delete all[id];
            else all[id] = { p: Math.floor(pos), d: Math.floor(dur || 0), t: U.now() };
            // Najvise 300 zapisa: izbaci najstarije.
            var keys = Object.keys(all);
            if (keys.length > 300) {
                keys.sort(function (a, b) { return all[a].t - all[b].t; });
                for (var i = 0; i < keys.length - 300; i++) delete all[keys[i]];
            }
            U.store.set(Lib.k(kind, 'resume'), all);
        },
        hiddenIds: function (kind) { return U.store.get(Lib.k(kind, 'hidden'), []); },
        hiddenSet: function (kind) {
            var s = {};
            Lib.hiddenIds(kind).forEach(function (id) { s[id] = true; });
            return s;
        },
        setHidden: function (kind, ids) { U.store.set(Lib.k(kind, 'hidden'), ids); },

        /** Istek Xtream playliste: null = nema podatka, 0 = neograniceno, inace Date. */
        playlistExpiry: function () {
            if (Lib.type !== 'xtream' || !Lib.userInfo) return null;
            var e = Lib.userInfo.exp_date;
            if (e === null || e === undefined || e === '' || e === '0' || e === 0 || e === 'null') return 0;
            var n = parseInt(e, 10);
            if (isNaN(n) || n < 86400 * 365) return 0;
            return new Date(n * 1000);
        }
    };

    /* ======================= pomocne funkcije ======================= */
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function catId(r) {
        var c = r.category_id;
        if (c === null || c === undefined || c === '' || c === 'null') {
            if (r.category_ids && r.category_ids.length) c = r.category_ids[0];
            else return NONE;
        }
        return String(c);
    }
    function mapLive(r, i) {
        return {
            id: U.str(r.stream_id),
            name: U.str(r.name).trim(),
            icon: U.str(r.stream_icon),
            num: num(r.num) || (i + 1),
            cat: catId(r),
            epg: U.str(r.epg_channel_id),
            archive: r.tv_archive == 1,
            archiveDays: parseInt(r.tv_archive_duration, 10) || 0,
            added: num(r.added)
        };
    }
    function mapVod(r, i) {
        return {
            id: U.str(r.stream_id),
            name: U.str(r.name).trim(),
            icon: U.str(r.stream_icon || r.cover),
            num: num(r.num) || (i + 1),
            cat: catId(r),
            ext: U.str(r.container_extension) || 'mp4',
            added: num(r.added),
            rating: num(r.rating_5based) ? num(r.rating_5based) * 2 : num(r.rating),
            year: U.str(r.year || r.releaseDate || '').substr(0, 4)
        };
    }
    function mapSeries(r, i) {
        return {
            id: U.str(r.series_id),
            name: U.str(r.name).trim(),
            icon: U.str(r.cover),
            num: num(r.num) || (i + 1),
            cat: catId(r),
            added: num(r.last_modified),
            rating: num(r.rating_5based) ? num(r.rating_5based) * 2 : num(r.rating),
            year: U.str(r.releaseDate || r.release_date || r.year || '').substr(0, 4),
            plot: U.str(r.plot),
            genre: U.str(r.genre),
            cast: U.str(r.cast),
            director: U.str(r.director),
            trailer: U.str(r.youtube_trailer),
            backdrop: (r.backdrop_path && r.backdrop_path.length) ? U.str(r.backdrop_path[0]) : ''
        };
    }

    /** #EXTINF:-1 tvg-id="x" tvg-logo="y" group-title="z",Ime kanala */
    function parseExtinf(line) {
        var res = { name: '', group: '', logo: '', tvgId: '', tvgName: '', catchup: '' };
        var re = /([a-zA-Z0-9_-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line)) !== null) {
            var k = m[1].toLowerCase();
            if (k === 'group-title') res.group = m[2].trim();
            else if (k === 'tvg-logo' || k === 'logo') res.logo = m[2].trim();
            else if (k === 'tvg-id') res.tvgId = m[2].trim();
            else if (k === 'tvg-name') res.tvgName = m[2].trim();
            else if (k === 'catchup' || k === 'catchup-source' || k === 'tvg-rec') res.catchup = m[2];
        }
        // Ime je iza zadnjeg zareza koji nije unutar navodnika.
        var inQ = false, cut = -1;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (c === '"') inQ = !inQ;
            else if (c === ',' && !inQ) cut = i;
        }
        if (cut >= 0) res.name = line.substr(cut + 1).trim();
        if (!res.name) res.name = res.tvgName;
        return res;
    }

    /** M3U serije: "Ime S01 E02" / "Ime S01E02" / "Ime 1x02" -> serija > sezona > epizoda. */
    function groupSeries(eps) {
        var map = {}, list = [];
        eps.forEach(function (e, i) {
            var m = e.name.match(/^(.*?)[\s._-]*[Ss](\d{1,2})[\s._-]*[Ee](\d{1,3})(.*)$/) || e.name.match(/^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})(.*)$/);
            var sName = m ? m[1].trim() : e.name;
            var season = m ? parseInt(m[2], 10) : 1;
            var epNum = m ? parseInt(m[3], 10) : 1;
            var key = e.cat + '|' + sName.toLowerCase();
            var s = map[key];
            if (!s) {
                s = map[key] = {
                    id: 's' + (list.length + 1), name: sName || e.name, icon: e.icon, cat: e.cat, num: list.length + 1,
                    added: e.num, rating: 0, year: '', plot: '', genre: '', cast: '', director: '', trailer: '', backdrop: '',
                    m3uSeasons: {}
                };
                list.push(s);
            }
            if (!s.m3uSeasons[season]) s.m3uSeasons[season] = [];
            s.m3uSeasons[season].push({
                id: 'e' + i, num: epNum, title: (m && m[4] && m[4].replace(/^[\s:._-]+/, '')) || (t('episode') + ' ' + epNum),
                url: e.url, ext: (e.url.match(/\.([a-z0-9]{2,4})(\?|$)/i) || [])[1] || 'mp4', icon: e.icon
            });
            if (!s.icon && e.icon) s.icon = e.icon;
            s.added = Math.max(s.added, e.num);
        });
        return list;
    }
})();
