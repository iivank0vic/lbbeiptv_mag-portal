/*
 * Movies / Series: grid postera 2:3 (6 stupaca na TV-u), zaglavlje s kategorijom i sortiranjem.
 */
(function () {
    var layer = null, grid = null;
    var SORTS = ['added', 'number', 'rating', 'a-z', 'z-a'];
    var SORT_LABEL = { added: 'order_by_added', number: 'order_by_number', rating: 'order_by_rating', 'a-z': 'sort_a_z', 'z-a': 'sort_z_a' };

    var Grid = App.Grid = {
        kind: '', catId: null, items: [],

        init: function (l) {
            layer = l;
            var el = U.byId('panel-grid');
            el.innerHTML = '<div class="grid-head"><div class="gh-text"><div class="t-overline" id="grid-over"></div>' +
                '<div class="t-title" id="grid-title"></div></div><div id="grid-tools"></div></div><div id="grid" class="vlist"></div>';
            grid = new W.VGrid({
                el: U.byId('grid'), name: 'grid', cols: 6, cellCls: 'grid-card',
                rowH: function (w) { return Math.round((w - 32) * 1.5 + 32 + 44); },
                count: function () { return Grid.items.length; },
                inner: function (i) { return Grid.card(Grid.items[i]); },
                onOk: function (i) { App.Info.open(Grid.kind, Grid.items[i]); },
                onKey: function (a, i) {
                    if (a === 'yellow') { Grid.toggleFav(i); return true; }
                    return false;
                },
                nb: { left: 'cats', up: 'gtools' }
            });
            layer.zones.grid = grid;
            layer.zones.gtools = new W.Group({
                el: U.byId('grid-tools'), name: 'gtools',
                onOk: function (el) { if (el.getAttribute('data-act') === 'sort') Grid.chooseSort(); },
                nb: { down: 'grid', left: 'cats' }
            });
        },

        open: function (kind, catId) {
            Grid.kind = kind;
            Grid.catId = catId;
            Grid.items = App.Lib.items(kind, catId);
            U.byId('grid-over').textContent = kind === 'vod' ? t('movies') : t('tv_shows');
            U.byId('grid-title').textContent = App.Lib.categoryName(kind, catId);
            Grid.renderTools();
            grid.reset(0);
        },
        /** Ponovno ucitaj (nakon promjene favorita / sortiranja) uz zadrzavanje pozicije. */
        reload: function () {
            if (!Grid.kind) return;
            var cur = Grid.items[grid.index];
            Grid.items = App.Lib.items(Grid.kind, Grid.catId);
            var idx = cur ? Grid.items.indexOf(cur) : 0;
            grid.reset(Math.max(0, idx));
            if (Nav.current() === 'grid') grid.focus();
        },
        renderTools: function () {
            var key = App.Settings.get(Grid.kind === 'vod' ? 'vod_sort' : 'series_sort');
            U.byId('grid-tools').innerHTML = '<span class="t-caption" style="margin-right:24px">' + U.fmtNumber(Grid.items.length) + ' ' +
                U.esc(Grid.kind === 'vod' ? t('titles') : t('shows')) + '</span>' +
                '<div class="chip f" data-act="sort">' + App.icon('sort') + U.esc(t(SORT_LABEL[key] || 'order_by_added')) + '</div>';
        },
        card: function (it) {
            var L = App.Lib;
            var fav = L.isFav(Grid.kind, it.id);
            var res = Grid.kind === 'vod' ? L.getResume('vod', it.id) : null;
            return '<div class="pic" style="padding-top:150%">' + App.img(it.icon, '', it.name) +
                (it.rating ? '<div class="badge-rating" style="z-index:2">' + (Math.round(it.rating * 10) / 10) + '</div>' : '') +
                (fav ? '<div class="badge-fav" style="z-index:2">' + App.icon('star') + '</div>' : '') +
                (res && res.d ? '<div class="badge-prog" style="z-index:2"><div style="width:' + Math.round(100 * res.p / res.d) + '%"></div></div>' : '') +
                '</div><div class="cap">' + U.esc(it.name) + '</div>';
        },
        chooseSort: function () {
            var setting = Grid.kind === 'vod' ? 'vod_sort' : 'series_sort';
            var opts = SORTS.map(function (k) { return { label: t(SORT_LABEL[k]), value: k }; });
            App.Dialog.choose(t('sort'), opts, App.Settings.get(setting)).then(function (v) {
                if (!v) return;
                App.Settings.set(setting, v);
                Grid.items = App.Lib.items(Grid.kind, Grid.catId);
                Grid.renderTools();
                grid.reset(0);
                Nav.focus('grid');
            });
        },
        toggleFav: function (i) {
            var it = Grid.items[i];
            if (!it) return;
            var added = App.Lib.toggleFav(Grid.kind, it.id);
            App.toast(added ? t('add_to_favorite') : t('remove_favorites'));
            if (Grid.catId === App.Lib.FAV) Grid.reload(); else grid.repaintFocus ? grid.repaintFocus() : grid.render(true);
        }
    };
})();
