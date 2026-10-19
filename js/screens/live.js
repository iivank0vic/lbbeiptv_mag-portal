/*
 * Live TV: traka | kategorije | kanali | pregled + EPG (APP.md §3).
 * Promjena kategorije NE prekida stream. OK na kanal koji svira = puni ekran.
 * DESNO na kanalu s arhivom = catch-up (popis emisija), OK na proslu emisiju = reprodukcija.
 */
(function () {
    var layer = null, list = null;
    var epgCache = {};
    var EPG_TTL = 10 * 60 * 1000;

    var Live = App.Live = {
        catId: null,
        channels: [],
        playingId: null,
        active: false,
        mode: 'channels',     // 'channels' | 'catchup'
        catchCh: null,
        rows: [],             // catch-up redovi
        digits: '',

        init: function (l) {
            layer = l;
            var el = U.byId('panel-live');
            el.innerHTML =
                '<div class="ch-col"><div class="ch-head"><div class="t-section" id="ch-title"></div><div class="t-caption" id="ch-count"></div></div>' +
                '<div id="ch-list" class="vlist"></div></div>' +
                '<div class="pv-col"><div id="pv-box"><div class="pv-msg hidden" id="pv-msg"></div></div>' +
                '<div class="pv-title"><div class="t-section" id="pv-name"></div><span id="pv-star"></span></div>' +
                '<div class="pv-help" id="pv-help"></div>' +
                '<div class="epg-list" id="pv-epg"></div><div class="epg-desc" id="pv-desc"></div></div>';
            list = new W.VList({
                el: U.byId('ch-list'), name: 'channels', rowH: 92, rowCls: 'ch-row', pad: 2, page: 10,
                count: function () { return Live.mode === 'channels' ? Live.channels.length : Live.rows.length; },
                cls: function (i) { return Live.rowCls(i); },
                inner: function (i) { return Live.rowHtml(i); },
                onFocus: function (i) { Live.onFocus(i); },
                onOk: function (i) { Live.onOk(i); },
                onRight: function (i) { return Live.onRight(i); },
                onLeft: function () { if (Live.mode === 'catchup') { Live.exitCatchup(); return true; } return false; },
                onKey: function (a, i) { return Live.onKey(a, i); },
                nb: { left: 'cats' }
            });
            layer.zones.channels = list;
            App.Player.on(function (ev) { if (ev === 'state' || ev === 'media') Live.paintStatus(); });
        },

        /* ---------------- kategorije / kanali ---------------- */
        openCategory: function (catId, userAction, channelId, full) {
            Live.mode = 'channels';
            Live.catId = catId;
            Live.channels = App.Lib.items('live', catId);
            U.byId('ch-title').textContent = App.Lib.categoryName('live', catId);
            U.byId('ch-count').textContent = U.fmtNumber(Live.channels.length) + ' ' + t('channels');
            var idx = 0;
            var want = channelId || Live.playingId;
            if (want) for (var i = 0; i < Live.channels.length; i++) if (Live.channels[i].id === want) { idx = i; break; }
            list.reset(idx);
            Live.show();
            var ch = Live.channels[idx];
            if (ch && (channelId || !Live.active || !App.Player.media)) Live.play(ch);
            if (userAction) Nav.focus('channels');
            Live.onFocus(idx);
            if (full && ch) App.Fullscreen.openLive();
        },
        /** Panel vidljiv: video u pravokutnik pregleda. */
        show: function () {
            App.rootClass('av-hole', true);
            Live.placePreview();
            Live.paintStatus();
        },
        placePreview: function () {
            if (!App.Player.media) return;
            var box = U.byId('pv-box');
            var r = box.getBoundingClientRect();
            if (r.width < 10) return;
            App.Player.setRect(r.left + 2, r.top + 2, r.width - 4, r.height - 4);
        },
        /** Izlazak iz Live sekcije (Home/Movies/Series/Settings u traci). */
        leave: function () {
            if (!Live.active) return;
            Live.active = false;
            Live.playingId = null;
            Live.mode = 'channels';
            App.Player.stop();
            App.rootClass('av-hole', false);
        },
        /** BACK u listi kanala: iz catch-upa natrag na kanale; inace ne obradjuje. */
        back: function () {
            if (Live.mode === 'catchup') { Live.exitCatchup(); return true; }
            return false;
        },

        play: function (ch) {
            Live.active = true;
            Live.playingId = ch.id;
            App.Lib.pushRecent('live', ch.id);
            if (App.Shell.catKind === 'live' && App.Shell.layer) App.Shell.layer.zones.cats.repaint();
            App.Player.play({ kind: 'live', item: ch, url: App.Player.liveUrl(ch), title: ch.name });
            if (!App.Player.full) Live.placePreview();
            if (Live.mode === 'channels') list.repaint();
            Live.paintHelp();
        },
        playingIndex: function () {
            for (var i = 0; i < Live.channels.length; i++) if (Live.channels[i].id === Live.playingId) return i;
            return -1;
        },
        /** Prebacivanje kanala u punom ekranu (gore/dolje, CH+/-). */
        zap: function (d) {
            var n = Live.channels.length;
            if (!n) return null;
            var i = Live.playingIndex();
            i = i < 0 ? 0 : (i + d + n) % n;
            var ch = Live.channels[i];
            Live.play(ch);
            if (Live.mode === 'channels') { list.index = i; list.ensure(true); list.render(true); }
            return ch;
        },
        playingChannel: function () { return App.Lib.get('live', Live.playingId); },

        /* ---------------- redovi ---------------- */
        rowCls: function (i) {
            if (Live.mode === 'catchup') {
                var r = Live.rows[i];
                if (!r) return '';
                if (r.head) return 'date-head';
                return (r.p.start > U.now() ? 'dim' : '') + (r.playing ? ' activated' : '');
            }
            var ch = Live.channels[i];
            return ch && ch.id === Live.playingId ? 'activated' : '';
        },
        rowHtml: function (i) {
            if (Live.mode === 'catchup') {
                var r = Live.rows[i];
                if (!r) return '';
                if (r.head) return U.esc(r.label);
                var p = r.p, past = p.end < U.now(), now = p.start <= U.now() && p.end > U.now();
                return '<span class="num" style="width:120px">' + U.esc(U.fmtClock(p.start)) + '</span>' +
                    '<span class="nm">' + U.esc(p.title) + '</span>' +
                    (now ? '<span class="t-overline" style="margin-left:12px">' + U.esc(t('now')) + '</span>' : '') +
                    (past || now ? App.icon('play', 'past') : '');
            }
            var ch = Live.channels[i];
            if (!ch) return '';
            return '<span class="num">' + U.esc(ch.num || i + 1) + '</span>' +
                '<span class="logo">' + (U.safeUrl(ch.icon) ? '<img src="' + U.safeUrl(ch.icon) + '" alt="" onerror="this.style.display=\'none\'" />' : '') + '</span>' +
                '<span class="nm">' + U.esc(ch.name) + '</span>' +
                (ch.archive ? App.icon('catchup', 'catch') : '') +
                (App.Lib.isFav('live', ch.id) ? App.icon('star', 'star') : '');
        },

        /* ---------------- fokus / EPG ---------------- */
        onFocus: function (i) {
            if (Live.mode === 'catchup') {
                var r = Live.rows[i];
                if (r && r.p) {
                    U.byId('pv-desc').textContent = r.p.desc || '';
                }
                return;
            }
            var ch = Live.channels[i];
            if (!ch) return;
            U.byId('pv-name').textContent = ch.name;
            U.byId('pv-star').innerHTML = App.Lib.isFav('live', ch.id) ? App.icon('star') : '';
            Live.paintHelp();
            U.byId('pv-epg').innerHTML = '';
            U.byId('pv-desc').textContent = '';
            Live.loadEpg(ch);
        },
        paintHelp: function () {
            var ch = Live.mode === 'channels' ? Live.channels[list.index] : Live.catchCh;
            if (!ch) return;
            var parts = [];
            parts.push(ch.id === Live.playingId ? t('ok_full') : t('press_ok_to_play'));
            if (ch.archive && Live.mode === 'channels') parts.push(t('catchup_hint'));
            U.byId('pv-help').textContent = parts.join('   ·   ');
        },
        loadEpg: U.debounce(function (ch) {
            if (App.Lib.type !== 'xtream') { Live.paintEpg(ch, null); return; }
            var c = epgCache[ch.id];
            if (c && U.now() - c.t < EPG_TTL) { Live.paintEpg(ch, c.list); return; }
            App.Xtream.shortEpg(ch.id, 6).then(function (listE) {
                epgCache[ch.id] = { t: U.now(), list: listE };
                Live.paintEpg(ch, listE);
            }, function () { Live.paintEpg(ch, []); });
        }, 600),
        /** EPG za OSD (koristi isti cache). */
        epgFor: function (ch, cb) {
            if (!ch || App.Lib.type !== 'xtream') { cb([]); return; }
            var c = epgCache[ch.id];
            if (c && U.now() - c.t < EPG_TTL) { cb(c.list); return; }
            App.Xtream.shortEpg(ch.id, 6).then(function (l) { epgCache[ch.id] = { t: U.now(), list: l }; cb(l); }, function () { cb([]); });
        },
        paintEpg: function (ch, epg) {
            var cur = Live.mode === 'channels' ? Live.channels[list.index] : null;
            if (!cur || cur.id !== ch.id) return;
            var el = U.byId('pv-epg');
            var now = U.now();
            var items = (epg || []).filter(function (p) { return p.end > now; }).slice(0, 4);
            if (!items.length) {
                el.innerHTML = '<div class="epg-row"><span class="ti" style="color:#9AA7B2">' + U.esc(t('no_epg_data')) + '</span></div>';
                return;
            }
            var html = '';
            items.forEach(function (p, i) {
                var isNow = p.start <= now && p.end > now;
                var pct = isNow ? Math.round(100 * (now - p.start) / (p.end - p.start)) : 0;
                html += '<div class="epg-row' + (isNow ? ' now' : '') + '"><span class="tm">' + U.esc(U.fmtClock(p.start) + ' – ' + U.fmtClock(p.end)) +
                    '</span><span class="ti">' + U.esc(p.title) + (isNow ? '<div class="bar"><div style="width:' + pct + '%"></div></div>' : '') +
                    '</span><span class="tag">' + (isNow ? U.esc(t('now')) : (i === 1 || (i === 0 && !isNow) ? U.esc(t('next')) : '')) + '</span></div>';
            });
            el.innerHTML = html;
            U.byId('pv-desc').textContent = items[0] && items[0].start <= now ? items[0].desc : '';
        },
        paintStatus: function () {
            var msg = U.byId('pv-msg');
            if (!msg) return;
            var P = App.Player;
            if (!P.media || P.full || P.media.kind !== 'live') { U.hide(msg); return; }
            if (P.state === 'loading') { msg.innerHTML = '<div class="spinner"></div>'; U.show(msg); }
            else if (P.state === 'error') { msg.innerHTML = U.esc(t('stream_error')); U.show(msg); }
            else U.hide(msg);
        },

        /* ---------------- tipke ---------------- */
        onOk: function (i) {
            if (Live.mode === 'catchup') { Live.playCatchupRow(i); return; }
            var ch = Live.channels[i];
            if (!ch) return;
            if (ch.id === Live.playingId && App.Player.state !== 'error') App.Fullscreen.openLive();
            else Live.play(ch);
        },
        onRight: function (i) {
            if (Live.mode !== 'channels') return true;
            var ch = Live.channels[i];
            if (ch && ch.archive && App.Lib.type === 'xtream') { Live.enterCatchup(ch); return true; }
            return true;
        },
        onKey: function (a, i) {
            if (/^[0-9]$/.test(a)) { Live.digit(a, false); return true; }
            if (Live.mode !== 'channels') return false;
            var ch = Live.channels[i];
            if (a === 'yellow' && ch) { Live.toggleFav(ch); return true; }
            if ((a === 'red' || a === 'menu' || a === 'info') && ch) { Live.options(ch); return true; }
            if (a === 'green') { App.Search.open('live'); return true; }
            return false;
        },
        toggleFav: function (ch) {
            var added = App.Lib.toggleFav('live', ch.id);
            App.toast(added ? t('add_to_favorite') : t('remove_favorites'));
            if (Live.catId === App.Lib.FAV) {
                Live.channels = App.Lib.items('live', Live.catId);
                list.reset(Math.min(list.index, Math.max(0, Live.channels.length - 1)));
                if (Nav.current() === 'channels') list.focus();
                U.byId('ch-count').textContent = U.fmtNumber(Live.channels.length) + ' ' + t('channels');
            } else list.repaint();
            U.byId('pv-star').innerHTML = App.Lib.isFav('live', ch.id) ? App.icon('star') : '';
        },
        options: function (ch) {
            var fav = App.Lib.isFav('live', ch.id);
            var opts = [{ label: fav ? t('remove_favorites') : t('add_to_favorite'), value: 'fav' }, { label: t('search'), value: 'search' }];
            if (ch.archive && App.Lib.type === 'xtream') opts.push({ label: t('catch_up'), value: 'catchup' });
            App.Dialog.choose(ch.name, opts, null).then(function (v) {
                if (v === 'fav') Live.toggleFav(ch);
                else if (v === 'search') App.Search.open('live');
                else if (v === 'catchup') Live.enterCatchup(ch);
            });
        },
        /** Unos broja kanala s daljinskog. */
        digit: function (d, fullscreen) {
            Live.digits = (Live.digits + d).substr(0, 5);
            if (fullscreen) App.Fullscreen.showZap(Live.digits);
            else App.toast(Live.digits, 1500);
            clearTimeout(Live.digitTimer);
            Live.digitTimer = setTimeout(function () {
                var n = parseInt(Live.digits, 10);
                Live.digits = '';
                if (fullscreen) App.Fullscreen.showZap('');
                var idx = -1;
                for (var i = 0; i < Live.channels.length; i++) if (Live.channels[i].num == n) { idx = i; break; }
                if (idx < 0) {
                    // Nije u ovoj kategoriji: trazi u svim kanalima.
                    var all = App.Lib.live.items;
                    for (var j = 0; j < all.length; j++) if (all[j].num == n && !App.Lib.isLockedItem('live', all[j])) {
                        App.Shell.openLiveAt(all[j], fullscreen);
                        return;
                    }
                    return;
                }
                Live.mode = 'channels';
                list.index = idx; list.ensure(true); list.render(true);
                Live.play(Live.channels[idx]);
                Live.onFocus(idx);
            }, 1500);
        },

        /* ---------------- catch-up ---------------- */
        enterCatchup: function (ch) {
            Live.mode = 'catchup';
            Live.catchCh = ch;
            Live.rows = [];
            U.byId('ch-title').textContent = ch.name;
            U.byId('ch-count').textContent = t('catch_up');
            U.byId('pv-name').textContent = ch.name;
            U.byId('pv-epg').innerHTML = '<div class="epg-row"><div class="spinner" style="width:48px;height:48px;border-width:5px"></div></div>';
            U.byId('pv-desc').textContent = '';
            U.byId('pv-help').textContent = '';
            list.reset(0);
            App.Xtream.fullEpg(ch.id).then(function (progs) {
                if (Live.mode !== 'catchup' || Live.catchCh !== ch) return;
                var now = U.now();
                var minStart = now - (Math.max(1, ch.archiveDays || 3) * 86400000);
                var rows = [], lastDay = '', focus = 0;
                progs.forEach(function (p) {
                    if (p.end < minStart || p.start > now + 3 * 3600000) return;
                    var d = new Date(p.start);
                    var day = d.toDateString();
                    if (day !== lastDay) {
                        lastDay = day;
                        var lbl = day === new Date().toDateString() ? t('today') :
                            (day === new Date(now - 86400000).toDateString() ? t('yesterday') : U.fmtDayName(d));
                        rows.push({ head: true, label: lbl });
                    }
                    if (p.start <= now && p.end > now) focus = rows.length;
                    rows.push({ p: p });
                });
                Live.rows = rows;
                U.byId('pv-epg').innerHTML = rows.length ? '' : '<div class="epg-row"><span class="ti" style="color:#9AA7B2">' + U.esc(t('no_epg_data')) + '</span></div>';
                list.reset(focus);
                if (Nav.current() === 'channels') list.focus();
                Live.onFocus(focus);
            }, function () {
                U.byId('pv-epg').innerHTML = '<div class="epg-row"><span class="ti" style="color:#9AA7B2">' + U.esc(t('no_epg_data')) + '</span></div>';
            });
            Nav.focus('channels');
        },
        exitCatchup: function () {
            Live.mode = 'channels';
            var ch = Live.catchCh;
            U.byId('ch-title').textContent = App.Lib.categoryName('live', Live.catId);
            U.byId('ch-count').textContent = U.fmtNumber(Live.channels.length) + ' ' + t('channels');
            var idx = 0;
            for (var i = 0; i < Live.channels.length; i++) if (ch && Live.channels[i].id === ch.id) idx = i;
            list.reset(idx);
            Nav.focus('channels');
            Live.onFocus(idx);
        },
        playCatchupRow: function (i) {
            var r = Live.rows[i];
            if (!r || r.head) return;
            var p = r.p, now = U.now();
            if (p.start > now) return;
            if (p.start <= now && p.end > now && !p.hasArchive) {
                // Emisija koja traje bez arhive: live.
                Live.play(Live.catchCh);
                App.Fullscreen.openLive();
                return;
            }
            Live.rows.forEach(function (x) { x.playing = false; });
            r.playing = true;
            list.repaint();
            App.Fullscreen.openCatchup(Live.catchCh, p);
        }
    };
})();
