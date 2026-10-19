/*
 * Glavni ekran: navigacijska traka | stupac kategorija | sadrzaj (APP.md §3).
 * Traka je sklopljena (ikone); dok je fokus u njoj otvara se PREKO sadrzaja.
 */
(function () {
    var NAV = [
        { id: 'home', icon: 'home', label: function () { return t('home'); } },
        { id: 'live', icon: 'live', label: function () { return t('live_tv'); } },
        { id: 'movies', icon: 'movies', label: function () { return t('movies'); } },
        { id: 'series', icon: 'series', label: function () { return t('tv_shows'); } },
        { id: 'search', icon: 'search', label: function () { return t('search'); } },
        { id: 'settings', icon: 'settings', label: function () { return t('settings'); } },
        { spacer: true },
        { id: 'playlists', icon: 'playlists', label: function () { return t('playlists'); } },
        { id: 'account', icon: 'account', label: function () { return t('app_user_account'); } }
    ];
    var KIND = { live: 'live', movies: 'vod', series: 'series' };

    var Shell = App.Shell = {
        started: false,
        section: 'home',
        layer: null,
        cats: [],
        catKind: '',
        openCat: -1,       // indeks otvorene kategorije u Shell.cats
        panel: '',

        start: function () {
            Shell.stop();
            Shell.started = true;
            Shell.renderRail();
            var layer = Shell.layer = {
                name: 'main',
                zones: {},
                zone: null,
                onBack: Shell.onBack,
                onKey: Shell.onKey,
                onFocusZone: function (name) { U.toggle(U.byId('rail'), 'expanded', name === 'rail'); }
            };
            layer.zones.rail = new W.Group({
                el: U.byId('rail'), name: 'rail', linear: ['up', 'down'],
                onOk: function (el) { Shell.onRail(el.getAttribute('data-id')); },
                nb: { right: function () { return Shell.contentZones(); } }
            });
            layer.zones.cats = new W.VList({
                el: U.byId('cat-list'), name: 'cats', rowH: 76, rowCls: 'cat-item', pad: 2,
                count: function () { return Shell.cats.length; },
                cls: function (i) { return i === Shell.openCat ? 'activated' : ''; },
                inner: function (i) {
                    var c = Shell.cats[i];
                    var locked = App.Lib.isLocked(Shell.catKind, c);
                    var n = c.special ? App.Lib.countIn(Shell.catKind, c.id) : c.items.length;
                    return (c.id === App.Lib.FAV ? '' : '') + '<span class="nm">' + U.esc(c.name) + '</span>' +
                        (locked ? App.icon('lock', 'lock') : '<span class="cnt">' + n + '</span>');
                },
                onOk: function (i) { Shell.openCategory(i, true); },
                onRight: function () { return Nav.focus(Shell.panelZone()); },
                nb: { left: 'rail' }
            });
            Nav.push(layer);
            U.show('shell');
            App.Home.init(layer);
            App.Grid.init(layer);
            App.Live.init(layer);
            App.SettingsPanel.init(layer);
            Shell.select('home', { focus: true });
            Shell.updateExpiry();
        },

        stop: function () {
            if (!Shell.started) return;
            Shell.started = false;
            App.Live.leave();
            App.Player.stop();
            if (Shell.layer) Nav.pop(Shell.layer);
            Shell.layer = null;
            U.hide('shell');
        },

        renderRail: function () {
            var html = '<div class="rail-logo"><img src="images/logo.png" alt="" /><span>LBBE IPTV</span></div>';
            NAV.forEach(function (n) {
                if (n.spacer) { html += '<div class="rail-spacer"></div>'; return; }
                html += '<div class="nav-item f" data-id="' + n.id + '">' + App.icon(n.icon) + '<span class="lbl">' + U.esc(n.label()) + '</span></div>';
            });
            html += '<div class="rail-exp" id="rail-exp"></div>';
            U.byId('rail').innerHTML = html;
        },
        updateExpiry: function () {
            var el = U.byId('rail-exp');
            if (!el) return;
            var e = App.info && App.info.expire_date;
            el.innerHTML = e ? U.esc(t('expiration')) + '<b>' + U.esc(U.fmtDate(U.parseDate(e) || new Date())) + '</b>' : '';
        },
        markRail: function () {
            U.qsa('#rail .nav-item').forEach(function (el) {
                U.toggle(el, 'active', el.getAttribute('data-id') === Shell.section);
            });
        },

        onRail: function (id) {
            if (id === 'search') { App.Search.open(Shell.searchScope()); return; }
            if (id === 'playlists') { App.SettingsPanel.playlists(); return; }
            if (id === 'account') { App.SettingsPanel.account(); return; }
            Shell.select(id, { focus: true });
        },
        searchScope: function () {
            if (Shell.section === 'live' || Shell.section === 'movies' || Shell.section === 'series') return Shell.section;
            return null;
        },

        /* ---------------- sekcije ---------------- */
        select: function (section, opts) {
            opts = opts || {};
            var kind = KIND[section];
            if (kind && !App.Lib.count(kind)) {
                App.toast(section === 'live' ? t('no_channels') : (section === 'movies' ? t('no_movies') : t('no_series')));
                return;
            }
            if (section !== 'live') App.Live.leave();
            Shell.section = section;
            Shell.markRail();
            if (section === 'home') {
                Shell.showCats(false);
                Shell.showPanel('home');
                App.Home.render();
            } else if (section === 'settings') {
                Shell.showCats(false);
                Shell.showPanel('settings');
                App.SettingsPanel.render();
            } else if (section === 'live') {
                Shell.loadCats('live');
                Shell.showCats(true);
                if (App.Live.catId !== null && App.Live.active) {
                    Shell.openCat = Shell.indexOfCat(App.Live.catId);
                    Shell.showPanel('live');
                    App.Live.show();
                } else {
                    Shell.openCat = -1;
                    Shell.showHint('live', t('select_category'), t('live_hint'));
                }
                Shell.layer.zones.cats.reset(Math.max(0, Shell.openCat >= 0 ? Shell.openCat : Shell.firstContentCat()));
            } else {
                Shell.loadCats(kind);
                Shell.showCats(true);
                var first = Shell.firstContentCat();
                Shell.layer.zones.cats.reset(Math.max(0, first));
                if (first >= 0) Shell.openCategory(first, false);
                else { Shell.openCat = -1; Shell.showHint(section === 'movies' ? 'movies' : 'series', t('select_category'), ''); }
            }
            if (opts.focus) Nav.focus(Shell.contentZones()[0]) || Nav.focus(Shell.contentZones()[1]) || Nav.focus('rail');
        },

        loadCats: function (kind) {
            Shell.catKind = kind;
            Shell.cats = App.Lib.categories(kind);
            U.byId('cat-head').textContent = kind === 'live' ? t('live_tv') : (kind === 'vod' ? t('movies') : t('tv_shows'));
        },
        indexOfCat: function (id) {
            for (var i = 0; i < Shell.cats.length; i++) if (Shell.cats[i].id === id) return i;
            return -1;
        },
        /** Prva kategorija sa sadrzajem (preskace prazne Favorites/Recent i zakljucane). */
        firstContentCat: function () {
            var kind = Shell.catKind;
            for (var i = 0; i < Shell.cats.length; i++) {
                var c = Shell.cats[i];
                if (c.special) {
                    if (c.id === App.Lib.ALL) continue;
                    if (App.Lib.countIn(kind, c.id) > 0) return i;
                    continue;
                }
                if (!App.Lib.isLocked(kind, c) && c.items.length) return i;
            }
            return Shell.indexOfCat(App.Lib.ALL);
        },
        showCats: function (on) {
            U.show('cat-col', on);
            U.toggle(U.byId('content'), 'with-cats', on);
        },
        showPanel: function (name) {
            Shell.panel = name;
            ['home', 'hint', 'grid', 'settings', 'live'].forEach(function (p) { U.show('panel-' + p, p === name); });
            App.rootClass('av-hole', name === 'live');
        },
        showHint: function (icon, title, body) {
            var el = U.byId('panel-hint');
            el.innerHTML = '<div class="hint">' + App.icon(icon) + '<div class="t-section">' + U.esc(title) + '</div>' +
                (body ? '<div class="t-body">' + U.esc(body) + '</div>' : '') + '</div>';
            Shell.showPanel('hint');
        },

        /** Otvori kategoriju (PIN za adult). userAction = OK na kategoriji (fokus ide u sadrzaj). */
        openCategory: function (i, userAction) {
            var c = Shell.cats[i];
            if (!c) return;
            var kind = Shell.catKind;
            var go = function () {
                Shell.openCat = i;
                Shell.layer.zones.cats.repaint();
                if (kind === 'live') {
                    if (!App.Lib.countIn('live', c.id)) { App.toast(t('no_channels')); return; }
                    Shell.showPanel('live');
                    App.Live.openCategory(c.id, userAction);
                } else {
                    if (!App.Lib.countIn(kind, c.id)) { App.toast(kind === 'vod' ? t('no_movies') : t('no_series')); return; }
                    Shell.showPanel('grid');
                    App.Grid.open(kind, c.id);
                    if (userAction) Nav.focus('grid');
                }
            };
            if (App.Lib.isLocked(kind, c) && !c.unlocked) {
                App.Dialog.askPin().then(function (ok) { if (ok) { c.unlocked = true; go(); } });
                return;
            }
            go();
        },

        /** Zone sadrzaja redom kojim se pokusava fokus (DESNO iz trake, start). */
        contentZones: function () {
            if (!U.byId('cat-col').classList.contains('hidden')) {
                if (Shell.panel === 'live' && Shell.section === 'live') return ['channels', 'cats'];
                return ['cats'];
            }
            return [Shell.panelZone(), 'rail'];
        },
        panelZone: function () {
            if (Shell.panel === 'home') return App.Home.startZone();
            if (Shell.panel === 'grid') return 'grid';
            if (Shell.panel === 'settings') return 'settings';
            if (Shell.panel === 'live') return 'channels';
            return 'cats';
        },

        onBack: function () {
            var z = Nav.current();
            if (z === 'rail') {
                if (Shell.section !== 'home') { Shell.select('home'); Nav.focus('rail'); return; }
                App.confirmExit();
                return;
            }
            if (z === 'cats') { Nav.focus('rail'); return; }
            var catsVisible = !U.byId('cat-col').classList.contains('hidden');
            if (z === 'channels' && App.Live.back()) return;
            if (catsVisible) { Nav.focus('cats', { index: Math.max(0, Shell.openCat) }); return; }
            Nav.focus('rail');
        },

        onKey: function (a) {
            // MENU / plava: kruzenje Live -> Movies -> Series.
            if (a === 'blue' || (a === 'menu' && Shell.section !== 'live')) {
                var order = ['live', 'movies', 'series'];
                var i = order.indexOf(Shell.section);
                for (var k = 1; k <= 3; k++) {
                    var next = order[(i + k + 3) % 3];
                    if (App.Lib.count(KIND[next])) { Shell.select(next, { focus: true }); break; }
                }
                return true;
            }
            if (a === 'exit') { App.confirmExit(); return true; }
            return false;
        },

        /** Iz pretrage / Home reda: otvori Live na kategoriji i kanalu. */
        openLiveAt: function (ch, full) {
            Shell.section = 'live';
            Shell.markRail();
            Shell.loadCats('live');
            Shell.showCats(true);
            var ci = Shell.indexOfCat(ch.cat);
            var c = Shell.cats[ci];
            // Zakljucana ili skrivena kategorija: otvori kroz Favorites (ako je tamo) ili All.
            if (ci < 0 || (App.Lib.isLocked('live', c) && !c.unlocked)) {
                ci = App.Lib.isFav('live', ch.id) ? Shell.indexOfCat(App.Lib.FAV) : Shell.indexOfCat(App.Lib.ALL);
            }
            Shell.openCat = ci;
            Shell.layer.zones.cats.reset(ci);
            Shell.showPanel('live');
            App.Live.openCategory(Shell.cats[ci].id, true, ch.id, full);
        }
    };
})();
