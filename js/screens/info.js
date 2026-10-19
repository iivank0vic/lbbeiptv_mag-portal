/*
 * Info ekran filma / serije: poster, podaci, radnja, gumbi (Play/Resume, Start over, Trailer,
 * Favorit). Serija: sezone (chipovi) + epizode, nastavak zadnje gledane epizode.
 */
(function () {
    var layer = null;
    var I = App.Info = {
        kind: '', item: null, data: null,
        seasons: [], season: null, episodes: [],

        visible: function () { return !!layer; },

        open: function (kind, item) {
            I.kind = kind;
            I.item = item;
            I.data = null;
            I.seasons = []; I.episodes = []; I.season = null;
            I.render();
            if (!layer) {
                layer = { name: 'info', zones: {}, zone: null, onBack: I.close, onKey: I.onKey };
                Nav.push(layer);
            }
            I.bindZones();
            Nav.focus('actions');
            I.load();
        },
        close: function () {
            if (!layer) return;
            var l = layer;
            layer = null;
            Nav.pop(l);
            U.hide('info');
            U.byId('info').innerHTML = '';
            // Grid/Home pokazuju favorite i napredak: osvjezi.
            if (App.Shell.panel === 'live' && App.Live.active && !App.Player.media) {
                // Film je zamijenio live pregled: vrati kanal koji je svirao.
                var ch = App.Live.playingChannel();
                if (ch) App.Live.play(ch);
            }
            if (App.Shell.panel === 'grid') App.Grid.reload();
            else if (App.Shell.panel === 'home') { App.Home.render(); Nav.focus(App.Home.startZone()); }
        },
        refresh: function () {
            if (!layer) return;
            var zone = layer.zone;
            I.render();
            I.bindZones();
            Nav.focus(zone && layer.zones[zone] ? zone : 'actions');
        },

        load: function () {
            var it = I.item;
            if (App.Lib.type !== 'xtream') {
                if (I.kind === 'series' && it.m3uSeasons) I.useM3uSeasons(it);
                I.refresh();
                return;
            }
            var p = I.kind === 'vod' ? App.Xtream.vodInfo(it.id) : App.Xtream.seriesInfo(it.id);
            p.then(function (d) {
                if (I.item !== it || !layer) return;
                I.data = d || {};
                if (I.kind === 'series') I.parseSeries(d || {});
                I.refresh();
            }, function () { });
        },

        /* ---------------- podaci ---------------- */
        info: function () {
            var it = I.item, d = I.data || {};
            var inf = d.info || {};
            if (Object.prototype.toString.call(inf) === '[object Array]') inf = {};
            var md = d.movie_data || {};
            var backdrop = inf.backdrop_path;
            if (backdrop && backdrop.length !== undefined && typeof backdrop !== 'string') backdrop = backdrop[0];
            var rating = parseFloat(inf.rating) || it.rating || 0;
            return {
                name: md.name || inf.name || it.name,
                poster: inf.movie_image || inf.cover_big || inf.cover || it.icon,
                backdrop: backdrop || it.backdrop || '',
                plot: inf.plot || inf.description || it.plot || '',
                genre: inf.genre || it.genre || '',
                cast: inf.cast || inf.actors || it.cast || '',
                director: inf.director || it.director || '',
                year: String(inf.releasedate || inf.releaseDate || inf.release_date || it.year || '').substr(0, 4),
                duration: inf.duration || (inf.episode_run_time ? inf.episode_run_time + ' min' : ''),
                rating: rating ? Math.round(rating * 10) / 10 : 0,
                trailer: inf.youtube_trailer || it.trailer || '',
                ext: md.container_extension || it.ext || 'mp4'
            };
        },
        parseSeries: function (d) {
            var eps = d.episodes || {};
            var keys = Object.keys(eps).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
            I.seasons = keys.map(function (k) {
                var list = U.toArray(eps[k]).map(function (e, i) {
                    var info = e.info || {};
                    return {
                        id: U.str(e.id), num: parseInt(e.episode_num, 10) || (i + 1), title: U.str(e.title) || (t('episode') + ' ' + (i + 1)),
                        ext: e.container_extension || 'mp4', plot: info.plot || '', duration: info.duration || '',
                        durSec: parseInt(info.duration_secs, 10) || 0, season: parseInt(k, 10) || 1, url: '',
                        image: U.safeUrl(info.movie_image || info.cover_big || '') || ''
                    };
                });
                list.sort(function (a, b) { return a.num - b.num; });
                return { num: parseInt(k, 10) || 0, episodes: list };
            }).filter(function (s) { return s.episodes.length; });
            I.pickInitialSeason();
        },
        useM3uSeasons: function (it) {
            var keys = Object.keys(it.m3uSeasons).sort(function (a, b) { return a - b; });
            I.seasons = keys.map(function (k) {
                var list = it.m3uSeasons[k].map(function (e) { return { id: e.id, num: e.num, title: e.title, ext: e.ext, url: e.url, season: parseInt(k, 10) }; });
                list.sort(function (a, b) { return a.num - b.num; });
                return { num: parseInt(k, 10), episodes: list };
            });
            I.pickInitialSeason();
        },
        lastMap: function () { return U.store.get(App.Lib.k('series', 'last'), {}); },
        lastEpisode: function () {
            var id = I.lastMap()[I.item.id];
            if (!id) return null;
            for (var s = 0; s < I.seasons.length; s++) {
                for (var e = 0; e < I.seasons[s].episodes.length; e++) if (I.seasons[s].episodes[e].id === id) return { s: s, e: e };
            }
            return null;
        },
        pickInitialSeason: function () {
            var last = I.lastEpisode();
            I.season = last ? last.s : 0;
        },

        /* ---------------- prikaz ---------------- */
        render: function () {
            var el = U.byId('info');
            var inf = I.info();
            var fav = App.Lib.isFav(I.kind, I.item.id);
            var facts = [];
            if (inf.year) facts.push('<span>' + U.esc(inf.year) + '</span>');
            if (inf.duration) facts.push('<span>' + U.esc(inf.duration) + '</span>');
            if (inf.rating) facts.push('<span class="star">★ ' + inf.rating + '</span>');
            if (inf.genre) facts.push('<span>' + U.esc(inf.genre) + '</span>');
            var html = (U.safeUrl(inf.backdrop) ? '<div class="backdrop" style="background-image:url(\'' + U.safeUrl(inf.backdrop) + '\')"></div>' : '') +
                '<div class="shade"></div><div class="info-body"><div class="poster">' + App.img(inf.poster, I.kind === 'series' ? 'series' : 'poster') + '</div><div class="meta">' +
                '<div class="t-overline">' + U.esc(I.kind === 'vod' ? t('movies') : t('tv_shows')) + '</div>' +
                '<div class="t-title">' + U.esc(inf.name) + '</div>' +
                '<div class="facts">' + facts.join('') + '</div>' +
                (inf.plot ? '<div class="plot">' + U.esc(inf.plot) + '</div>' : '') +
                '<div class="crew">' + (inf.director ? '<div><b>' + U.esc(t('director')) + ':</b> ' + U.esc(inf.director) + '</div>' : '') +
                (inf.cast ? '<div><b>' + U.esc(t('cast')) + ':</b> ' + U.esc(inf.cast) + '</div>' : '') + '</div>' +
                '<div class="actions" id="info-actions">' + I.actionsHtml(inf, fav) + '</div>';
            if (I.kind === 'vod') {
                var r = App.Lib.getResume('vod', I.item.id);
                if (r) html += '<div class="resume-note">' + U.esc(t('resume')) + ' ' + U.fmtDur(r.p) + (r.d ? ' / ' + U.fmtDur(r.d) : '') + '</div>';
            }
            if (I.kind === 'series') {
                if (I.seasons.length) {
                    html += '<div class="seasons" id="info-seasons">';
                    I.seasons.forEach(function (s, i) {
                        html += '<div class="chip f' + (i === I.season ? ' on' : '') + '" data-s="' + i + '">' + U.esc(t('season') + ' ' + s.num) + '</div>';
                    });
                    html += '</div><div id="ep-list" class="vlist"></div>';
                } else if (I.data) {
                    html += '<div class="resume-note">' + U.esc(t('no_episode')) + '</div>';
                }
            }
            html += '</div></div>';
            el.innerHTML = html;
            U.show(el);
        },
        actionsHtml: function (inf, fav) {
            var h = '';
            if (I.kind === 'vod') {
                var r = App.Lib.getResume('vod', I.item.id);
                if (r) {
                    h += '<div class="btn primary f" data-act="resume">' + App.icon('play') + U.esc(t('resume')) + '</div>';
                    h += '<div class="btn f" data-act="start">' + App.icon('reload') + U.esc(t('start_over')) + '</div>';
                } else {
                    h += '<div class="btn primary f" data-act="start">' + App.icon('play') + U.esc(t('play')) + '</div>';
                }
            } else {
                var last = I.lastEpisode();
                if (I.seasons.length) {
                    var lbl = last ? t('resume') + '  ' + t('season_short') + I.seasons[last.s].num + ' ' + t('episode_short') + I.seasons[last.s].episodes[last.e].num : t('play');
                    h += '<div class="btn primary f" data-act="series-play">' + App.icon('play') + U.esc(lbl) + '</div>';
                }
            }
            if (inf.trailer) h += '<div class="btn f" data-act="trailer">' + App.icon('movies') + U.esc(t('trailer')) + '</div>';
            h += '<div class="btn f" data-act="fav">' + App.icon(fav ? 'star' : 'starOutline') + U.esc(fav ? t('remove_favorites') : t('add_to_favorite')) + '</div>';
            return h;
        },
        bindZones: function () {
            if (!layer) return;
            var hasSeasons = I.kind === 'series' && I.seasons.length;
            layer.zones.actions = new W.Group({
                el: U.byId('info-actions'), name: 'actions',
                onOk: function (el) { I.action(el.getAttribute('data-act')); },
                nb: { down: hasSeasons ? 'seasons' : null }
            });
            delete layer.zones.seasons; delete layer.zones.episodes;
            if (!hasSeasons) return;
            layer.zones.seasons = new W.Group({
                el: U.byId('info-seasons'), name: 'seasons', linear: ['left', 'right'], index: I.season,
                onOk: function (el, i) { I.selectSeason(i); Nav.focus('episodes'); },
                onFocus: function (el, i) { if (i !== I.season) I.selectSeason(i); },
                nb: { up: 'actions', down: 'episodes' }
            });
            var eps = new W.VList({
                el: U.byId('ep-list'), name: 'episodes', rowH: 100, rowCls: 'ep-row', pad: 0, viewH: 300,
                count: function () { return I.seasons[I.season] ? I.seasons[I.season].episodes.length : 0; },
                inner: function (i) {
                    var e = I.seasons[I.season].episodes[i];
                    var r = App.Lib.getResume('series', 'ep' + e.id);
                    return '<span class="en">' + e.num + '</span><span class="et">' + U.esc(e.title) + '</span>' +
                        (e.duration ? '<span class="ed">' + U.esc(e.duration) + '</span>' : '') +
                        (r && r.d ? '<div class="eprog"><div style="width:' + Math.round(100 * r.p / r.d) + '%"></div></div>' : '');
                },
                onOk: function (i) { I.playEpisode(I.season, i); },
                nb: { up: 'seasons' }
            });
            layer.zones.episodes = eps;
            // Lista epizoda zauzima prostor do dna ekrana.
            var epEl = U.byId('ep-list');
            epEl.style.height = Math.max(200, 1030 - epEl.getBoundingClientRect().top) + 'px';
            var last = I.lastEpisode();
            eps.reset(last && last.s === I.season ? last.e : 0);
        },
        selectSeason: function (i) {
            I.season = i;
            U.qsa('#info-seasons .chip').forEach(function (c, k) { U.toggle(c, 'on', k === i); });
            if (layer.zones.episodes) layer.zones.episodes.reset(0);
        },

        /* ---------------- akcije ---------------- */
        action: function (act) {
            var inf = I.info();
            if (act === 'resume' || act === 'start') {
                var r = act === 'resume' ? App.Lib.getResume('vod', I.item.id) : null;
                I.playMovie(r ? r.p : 0);
            } else if (act === 'series-play') {
                var last = I.lastEpisode();
                if (last) I.playEpisode(last.s, last.e, true); else I.playEpisode(0, 0);
            } else if (act === 'trailer') {
                I.trailer(inf.trailer);
            } else if (act === 'fav') {
                var added = App.Lib.toggleFav(I.kind, I.item.id);
                App.toast(added ? t('add_to_favorite') : t('remove_favorites'));
                I.refresh();
            }
        },
        playMovie: function (start) {
            var it = I.item, inf = I.info();
            App.Lib.pushRecent('vod', it.id);
            var url = it.url || App.Xtream.streamUrl('movie', it.id, inf.ext);
            App.Fullscreen.openVod({
                kind: 'vod', item: it, url: url, title: inf.name, subtitle: [inf.year, inf.genre].filter(Boolean).join('  ·  '),
                start: start || 0, resumeKey: { kind: 'vod', id: it.id },
                about: { plot: inf.plot || '', facts: [inf.year, inf.duration, inf.genre, inf.rating ? '★ ' + inf.rating : ''].filter(Boolean).join('  ·  '),
                    director: inf.director || '', cast: inf.cast || '' }
            });
        },
        playEpisode: function (s, e, resume) {
            var season = I.seasons[s];
            var ep = season && season.episodes[e];
            if (!ep) return;
            var name = I.info().name;
            App.Lib.pushRecent('series', I.item.id);
            var r = App.Lib.getResume('series', 'ep' + ep.id);
            var media = I.episodeMedia(s, e);
            media.start = r ? r.p : 0;
            if (r && !resume) {
                // Kao Android: pitaj nastavak ili ispocetka.
                App.Dialog.confirm(t('resume'), t('resume_playback_from_last_position') + ' (' + U.fmtDur(r.p) + ')', t('resume'), t('start_over')).then(function (yes) {
                    if (!yes) media.start = 0;
                    App.Fullscreen.openVod(media);
                });
                return;
            }
            App.Fullscreen.openVod(media);
        },
        /** Medij za epizodu (za "Next episode" / automatski nastavak). */
        episodeMedia: function (s, e) {
            var season = I.seasons[s], ep = season.episodes[e];
            var name = I.info().name;
            var media = {
                kind: 'episode', item: ep,
                url: ep.url || App.Xtream.streamUrl('series', ep.id, ep.ext),
                title: name,
                subtitle: t('season_short') + season.num + ' ' + t('episode_short') + ep.num + '  ·  ' + ep.title,
                start: 0,
                resumeKey: { kind: 'series', id: 'ep' + ep.id },
                // Za red epizoda u OSD-u (Android 2.2.6): epizode iste sezone i trenutna pozicija.
                episodes: season.episodes, epIndex: e, seasonNum: season.num,
                at: function (i) { return season.episodes[i] ? I.episodeMedia(s, i) : null; },
                next: function () {
                    var ns = s, ne = e + 1;
                    if (ne >= season.episodes.length) { ns = s + 1; ne = 0; }
                    if (!I.seasons[ns] || !I.seasons[ns].episodes[ne]) return null;
                    if (!media._next) media._next = I.episodeMedia(ns, ne);
                    return media._next;
                },
                prev: function () {
                    var ns = s, ne = e - 1;
                    if (ne < 0) { ns = s - 1; if (!I.seasons[ns]) return null; ne = I.seasons[ns].episodes.length - 1; }
                    return I.seasons[ns] && I.seasons[ns].episodes[ne] ? I.episodeMedia(ns, ne) : null;
                }
            };
            // "Zadnja gledana" se biljezi tek kad epizoda krene (next()/prev() samo grade medij).
            var seriesId = I.item.id;
            media.onPlay = function () {
                var last = U.store.get(App.Lib.k('series', 'last'), {});
                last[seriesId] = ep.id;
                U.store.set(App.Lib.k('series', 'last'), last);
            };
            return media;
        },
        trailer: function (code) {
            var id = String(code || '').trim();
            var m = id.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
            if (m) id = m[1];
            if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) { App.toast(t('no_trailer')); return; }
            var fs = U.byId('fs');
            fs.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&controls=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media"></iframe>';
            U.show(fs);
            var tl = {
                name: 'trailer', zones: { s: { key: function () { return false; }, focus: function () { }, blur: function () { }, nb: {} } }, zone: 's',
                onBack: function () { Nav.pop(tl); fs.innerHTML = ''; U.hide(fs); }
            };
            Nav.push(tl);
        },
        onKey: function (a) {
            if (a === 'yellow') { I.action('fav'); return true; }
            if (a === 'play' || a === 'playpause') {
                if (I.kind === 'vod') I.action(App.Lib.getResume('vod', I.item.id) ? 'resume' : 'start');
                else I.action('series-play');
                return true;
            }
            return false;
        }
    };
})();
