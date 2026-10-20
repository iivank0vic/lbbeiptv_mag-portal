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
        ratio_mode: 'fill'
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
            Lib.userInfo = null; Lib.serverInfo = null; Lib.epgUrls = [];
            if (App.XmlEpg) App.XmlEpg.reset();
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
            var id = Lib.loadId = (Lib.loadId || 0) + 1;
            progress = progress || function () { };
            var acc = App.Xtream.parse(url);
            if (acc) {
                App.Xtream.set(acc);
                return Lib.loadXtream(progress, id).then(null, function (err) {
                    if (err && (err.fatal || err.cancelled)) throw err;
                    U.log('Xtream API failed, trying M3U', err);
                    // Rezerva: isti URL kao M3U. Ako ni to ne uspije, prijavi izvornu (Xtream) gresku.
                    return Lib.loadM3u(url, progress, id).then(null, function (e2) { if (e2 && e2.cancelled) throw e2; throw err; });
                });
            }
            return Lib.loadM3u(url, progress, id);
        },
        /** Prekid ucitavanja ("Taking too long"): zakasnjeli odgovori se odbacuju. */
        cancel: function () { Lib.loadId = (Lib.loadId || 0) + 1; },
        alive: function (id) { if (id !== Lib.loadId) throw { cancelled: true }; },

        /** Xtream u 7 koraka kao Android: prijava, 3x kategorije, live, filmovi, serije. */
        loadXtream: function (progress, id) {
            var X = App.Xtream;
            var cats = {};
            Lib.type = 'xtream';
            progress('loading_signing_in', 4, 1, 7);
            return X.get('', '', 25000).then(function (auth) {
                Lib.alive(id);
                if (!auth || typeof auth !== 'object') throw { status: 0, parse: true };
                var ui = auth.user_info;
                if (ui && (ui.auth === 0 || ui.auth === '0')) throw { status: 401, fatal: true, auth: true };
                if (ui && ui.status && /expired/i.test(ui.status)) throw { status: 403, fatal: true, expired: true };
                if (ui && ui.status && /banned|disabled/i.test(ui.status)) throw { status: 403, fatal: true, auth: true };
                Lib.userInfo = ui || null;
                Lib.serverInfo = auth.server_info || null;
                if (!ui && !auth.server_info) throw { status: 0, parse: true };
                progress('loading_live_categories', 12, 2, 7);
                return X.get('get_live_categories', '', 45000).then(null, function () { return []; });
            }).then(function (r) {
                Lib.alive(id); cats.live = U.toArray(r);
                progress('loading_vod_categories', 18, 3, 7);
                return X.get('get_vod_categories', '', 45000).then(null, function () { return []; });
            }).then(function (r) {
                Lib.alive(id); cats.vod = U.toArray(r);
                progress('loading_series_categories', 24, 4, 7);
                return X.get('get_series_categories', '', 45000).then(null, function () { return []; });
            }).then(function (r) {
                Lib.alive(id); cats.series = U.toArray(r);
                progress('loading_live', 30, 5, 7);
                return X.get('get_live_streams', '', 180000);
            }).then(function (r) {
                Lib.alive(id);
                Lib.build('live', cats.live, U.toArray(r));
                progress('loading_vod', 50, 6, 7);
                return X.get('get_vod_streams', '', 180000).then(null, function () { return []; });
            }).then(function (r) {
                Lib.alive(id);
                Lib.build('vod', cats.vod, U.toArray(r));
                progress('loading_series', 75, 7, 7);
                return X.get('get_series', '', 180000).then(null, function () { return []; });
            }).then(function (r) {
                Lib.alive(id);
                Lib.build('series', cats.series, U.toArray(r));
                progress('loading_starting', 98, 7, 7);
                if (!Lib.live.items.length && !Lib.vod.items.length && !Lib.series.items.length) {
                    throw { status: 0, empty: true, fatal: true };
                }
                Lib.saveCache();
            });
        },

        /** M3U u 2 koraka: download (%, MB, MB/s) i obrada. */
        loadM3u: function (url, progress, id) {
            Lib.type = 'm3u';
            var t0 = U.now();
            progress('loading_download', 3, 1, 2);
            return U.http({
                url: url, type: 'text', timeout: 300000,
                onProgress: function (e) {
                    if (!e || id !== Lib.loadId) return;
                    var mb = e.loaded / 1048576, sec = Math.max(0.2, (U.now() - t0) / 1000);
                    var speed = (mb / sec).toFixed(1) + ' MB/s';
                    if (e.lengthComputable && e.total) {
                        var pct = Math.round(100 * e.loaded / e.total);
                        progress('loading_download', 3 + Math.round(0.8 * pct), 1, 2, pct + '%  \u00b7  ' + mb.toFixed(1) + ' / ' + (e.total / 1048576).toFixed(1) + ' MB  \u00b7  ' + speed);
                    } else {
                        progress('loading_download', 40, 1, 2, mb.toFixed(1) + ' MB  \u00b7  ' + speed);
                    }
                }
            }).then(function (text) {
                Lib.alive(id);
                progress('loading_processing', 88, 2, 2);
                if (typeof text !== 'string' || text.indexOf('#EXTINF') < 0) throw { status: 0, empty: true, fatal: true };
                Lib.parseM3u(text);
                if (!Lib.live.items.length && !Lib.vod.items.length && !Lib.series.items.length) {
                    throw { status: 0, empty: true, fatal: true };
                }
                progress('loading_starting', 98, 2, 2);
                Lib.saveCache();
            }, function (err) {
                if (err && !err.cancelled && !err.empty) err.m3u = true;
                throw err;
            });
        },

        /* ---------------- spremljeni podaci (IndexedDB) ---------------- */
        /** Kopija ucitane liste: "Continue with saved data" kad server liste ne radi. */
        saveCache: function () {
            if (!App.Cache || !App.Cache.available()) return;
            var strip = function (K) {
                return { cats: K.cats.map(function (c) { return { id: c.id, name: c.name }; }), items: K.items };
            };
            App.Cache.put({
                key: Lib.key, url: Lib.url, type: Lib.type, savedAt: U.now(), epgUrls: Lib.epgUrls,
                userInfo: Lib.userInfo, serverInfo: Lib.serverInfo,
                live: strip(Lib.live), vod: strip(Lib.vod), series: strip(Lib.series)
            });
        },
        /** Ucitaj spremljenu kopiju liste. Promise<boolean>. */
        loadCache: function (url) {
            if (!App.Cache || !App.Cache.available()) return Promise.resolve(false);
            var key = 'pl_' + U.hash(url);
            return App.Cache.get(key).then(function (d) {
                if (!d || !d.live) return false;
                Lib.reset();
                Lib.url = url; Lib.key = key; Lib.type = d.type;
                Lib.userInfo = d.userInfo || null; Lib.serverInfo = d.serverInfo || null;
                Lib.cacheTime = d.savedAt;
                Lib.epgUrls = d.epgUrls || [];
                if (Lib.type === 'xtream') { var acc = App.Xtream.parse(url); if (acc) App.Xtream.set(acc); }
                ['live', 'vod', 'series'].forEach(function (kind) { Lib.indexPlain(kind, d[kind].cats.map(function (c) { return { category_id: c.id, category_name: c.name }; }), d[kind].items || []); });
                return Lib.live.items.length + Lib.vod.items.length + Lib.series.items.length > 0;
            });
        },
        hasCache: function (url) {
            if (!App.Cache || !App.Cache.available()) return Promise.resolve(false);
            return App.Cache.has('pl_' + U.hash(url));
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
            Lib.epgUrls = Lib.epgUrls || [];
            var live = [], vod = [], seriesEps = [];
            var cats = { live: {}, vod: {}, series: {} };
            var catList = { live: [], vod: [], series: [] };
            var cur = null, num = 0, seen = {};
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;
                if (line.indexOf('#EXTINF') === 0) {
                    cur = parseExtinf(line);
                    continue;
                }
                if (line.indexOf('#EXTM3U') === 0 || line.indexOf('\ufeff#EXTM3U') === 0) {
                    // EPG adrese: url-tvg="a.xml.gz,b.xml" / x-tvg-url / tvg-url.
                    var hre = /\b(?:url-tvg|x-tvg-url|tvg-url)="([^"]*)"/gi, hm;
                    while ((hm = hre.exec(line)) !== null) {
                        hm[1].split(',').forEach(function (u) { u = u.replace(/^\s+|\s+$/g, ''); if (u && Lib.epgUrls.indexOf(u) < 0) Lib.epgUrls.push(u); });
                    }
                    continue;
                }
                if (line.charAt(0) === '#') {
                    if (cur && line.indexOf('#EXTGRP:') === 0 && !cur.group) cur.group = line.substr(8).trim();
                    continue;
                }
                if (!cur) continue;
                if (!/^(https?|rtmp|rtsp|udp):\/\//i.test(line)) { cur = null; continue; }
                var url = line;
                var kind = m3uKind(cur, url);
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
                    base.id = stableId('m', url, seen);
                    base.archive = cur.catchup ? true : false;
                    live.push(base);
                } else if (kind === 'vod') {
                    base.id = stableId('v', url, seen);
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

    /**
     * Stabilan ID za M3U stavke (iz URL-a / imena), da favoriti, povijest i nastavak prezive osvjezavanje
     * liste (Android: "Series favourites were lost on every M3U refresh").
     */
    function stableId(prefix, key, seen) {
        var id = prefix + U.hash(key);
        if (seen[id]) { seen[id]++; id += '_' + seen[id]; } else seen[id] = 1;
        return id;
    }

    /** #EXTINF:-1 tvg-id="x" tvg-logo="y" group-title="z",Ime kanala */
    function parseExtinf(line) {
        var res = { name: '', group: '', logo: '', tvgId: '', tvgName: '', catchup: '', type: '' };
        var re = /([a-zA-Z0-9_-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line)) !== null) {
            var k = m[1].toLowerCase();
            if (k === 'group-title') res.group = m[2].trim();
            else if (k === 'tvg-logo' || k === 'logo') res.logo = m[2].trim();
            else if (k === 'tvg-id') res.tvgId = m[2].trim();
            else if (k === 'tvg-name') res.tvgName = m[2].trim();
            else if (k === 'catchup' || k === 'catchup-source' || k === 'tvg-rec') res.catchup = m[2];
            else if (k === 'tvg-type' || k === 'type') res.type = m[2].trim().toLowerCase();
        }
        // Ime je iza PRVOG zareza izvan navodnika (atributi su uvijek ispred imena): "Kanal 1, HD"
        // ostaje cijelo ime, a zarez unutar group-title="A, B" se preskace.
        var inQ = false, cut = -1;
        for (var i = 0; i < line.length; i++) {
            var c = line.charAt(i);
            if (c === '"') inQ = !inQ;
            else if (c === ',' && !inQ) { cut = i; break; }
        }
        if (cut >= 0) res.name = line.substr(cut + 1).trim();
        if (!res.name) res.name = res.tvgName;
        return res;
    }

    /**
     * Vrsta M3U stavke: 1) tvg-type (XUI ONE / vecina generatora: live | movie | series),
     * 2) Xtream putanja u URL-u (/movie/, /series/), 3) "S01E02" u imenu + video datoteka = epizoda,
     * 4) video datoteka (.mp4, .mkv…) = film, inace live.
     */
    var VIDEO_FILE = /\.(mp4|mkv|avi|mov|wmv|m4v|webm|flv|mpg|mpeg)(\?|#|$)/i;
    var EP_RE = /^(.*?)[\s._-]*[Ss](\d{1,2})[\s._-]*[Ee](\d{1,4})(.*)$/;
    var EP_RE_SEASON = /^(.*?)[\s._-]+(?:season|sezona|staffel|saison|s)\s*(\d{1,2})[\s._,-]*(?:episode|epizoda|folge|ep|e)\.?\s*(\d{1,4})(.*)$/i;
    var EP_RE_X = /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})(.*)$/;
    var EP_RE_WORD = /^(.*?)[\s._-]+(?:ep(?:isode)?|epizoda)\.?\s*(\d{1,4})(.*)$/i;
    function m3uKind(cur, url) {
        var ty = cur.type || '';
        if (/^(live|channel|tv|stream|radio)/.test(ty)) return 'live';
        if (/^(movie|movies|vod|film|video)/.test(ty)) return 'vod';
        if (/^(series|serie|show|tvshow|episode)/.test(ty)) return 'series';
        if (/\/series\//i.test(url)) return 'series';
        if (/\/movie\//i.test(url)) return 'vod';
        if (VIDEO_FILE.test(url)) return EP_RE.test(cur.name || '') || EP_RE_SEASON.test(cur.name || '') ? 'series' : 'vod';
        return 'live';
    }
    Lib.m3uKind = m3uKind;

    /** Epizoda iz imena: {series, season, ep, title} ("Ime S01E02 Naslov", "Ime 1x02", "Ime Episode 3"). */
    function parseEpisodeName(name) {
        var m = name.match(EP_RE) || name.match(EP_RE_SEASON) || name.match(EP_RE_X);
        if (m) return { series: m[1].replace(/[\s:._-]+$/, '').trim(), season: parseInt(m[2], 10), ep: parseInt(m[3], 10), title: m[4].replace(/^[\s:._-]+/, '').trim() };
        m = name.match(EP_RE_WORD);
        if (m) return { series: m[1].replace(/[\s:._-]+$/, '').trim(), season: 1, ep: parseInt(m[2], 10), title: m[3].replace(/^[\s:._-]+/, '').trim() };
        return null;
    }
    Lib.parseEpisodeName = parseEpisodeName;

    /** M3U serije: "Ime S01 E02" / "Ime S01E02" / "Ime 1x02" -> serija > sezona > epizoda. */
    function groupSeries(eps) {
        var map = {}, list = [], seenS = {};
        eps.forEach(function (e, i) {
            var p = parseEpisodeName(e.name);
            var sName = p && p.series ? p.series : e.name;
            var season = p ? p.season : 1;
            var epNum = p ? p.ep : 1;
            var key = e.cat + '|' + sName.toLowerCase();
            var s = map[key];
            if (!s) {
                s = map[key] = {
                    id: stableId('s', e.cat + '|' + sName.toLowerCase(), seenS), name: sName || e.name, icon: e.icon, cat: e.cat, num: list.length + 1,
                    added: e.num, rating: 0, year: '', plot: '', genre: '', cast: '', director: '', trailer: '', backdrop: '',
                    m3uSeasons: {}
                };
                list.push(s);
            }
            if (!s.m3uSeasons[season]) s.m3uSeasons[season] = [];
            s.m3uSeasons[season].push({
                id: stableId('e', e.url, seenS), num: epNum, title: (p && p.title) || (t('episode') + ' ' + epNum),
                url: e.url, ext: (e.url.match(/\.([a-z0-9]{2,4})(\?|$)/i) || [])[1] || 'mp4', icon: e.icon
            });
            if (!s.icon && e.icon) s.icon = e.icon;
            s.added = Math.max(s.added, e.num);
        });
        return list;
    }
})();
