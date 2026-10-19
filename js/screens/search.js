/*
 * Pretraga: polje (pill) + rezultati u stilu reda kanala. Iz Live/Movies/Series trazi u toj
 * sekciji; s Home/Settings prvo bira sto se trazi (Live / Movies / Series).
 */
(function () {
    var layer = null, list = null;
    var KINDS = [{ sec: 'live', kind: 'live', label: 'live_tv' }, { sec: 'movies', kind: 'vod', label: 'movies' }, { sec: 'series', kind: 'series', label: 'tv_shows' }];

    var S = App.Search = {
        kind: 'live', results: [], query: '',

        open: function (section) {
            var fixed = !!section;
            var k = section ? KINDS.filter(function (x) { return x.sec === section; })[0] : null;
            S.kind = k ? k.kind : (App.Lib.count('live') ? 'live' : (App.Lib.count('vod') ? 'vod' : 'series'));
            S.results = [];
            S.query = '';
            var el = U.byId('search-ov');
            var chips = '';
            KINDS.forEach(function (x) {
                if (!App.Lib.count(x.kind)) return;
                chips += '<div class="chip f' + (x.kind === S.kind ? ' on' : '') + '" data-k="' + x.kind + '">' + App.icon(x.sec === 'live' ? 'live' : x.sec) + U.esc(t(x.label)) + '</div>';
            });
            el.className = fixed ? 'no-scopes' : '';
            el.innerHTML = '<div class="s-box"><div class="s-field f" id="s-field">' + App.icon('search') +
                '<input type="text" id="s-input" autocomplete="off" spellcheck="false" placeholder="' + U.esc(t('search_hint')) + '" /></div>' +
                '<div class="s-scopes" id="s-scopes">' + chips + '</div><div class="s-count" id="s-count"></div><div id="s-list" class="vlist"></div></div>';
            U.show(el);
            var input = U.byId('s-input');
            input.addEventListener('input', U.debounce(function () { S.run(input.value); }, 350));
            input.addEventListener('keydown', function (e) {
                if (e.keyCode === 13) { e.preventDefault(); input.blur(); if (S.results.length) Nav.focus('results'); }
            });

            list = new W.VList({
                el: U.byId('s-list'), name: 'results', rowH: 92, rowCls: 'ch-row', pad: 1,
                count: function () { return S.results.length; },
                inner: function (i) {
                    var it = S.results[i];
                    return '<span class="logo">' + (U.safeUrl(it.icon) ? '<img src="' + U.safeUrl(it.icon) + '" alt="" onerror="this.style.display=\'none\'" />' : '') + '</span>' +
                        '<span class="nm">' + U.esc(it.name) + '<span class="sub">' + U.esc(App.Lib.categoryName(S.kind, it.cat)) + '</span></span>' +
                        (App.Lib.isFav(S.kind, it.id) ? App.icon('star', 'star') : '');
                },
                onOk: function (i) { S.pick(S.results[i]); },
                nb: { up: fixed ? 'field' : 'scopes' }
            });
            layer = {
                name: 'search', zone: null,
                zones: {
                    field: {
                        nb: { down: fixed ? 'results' : 'scopes' },
                        focus: function () { U.byId('s-field').classList.add('focus'); },
                        blur: function () { U.byId('s-field').classList.remove('focus'); },
                        key: function (a) {
                            if (a === 'ok') { input.focus(); return true; }
                            return false;
                        },
                        setIndex: function () { }
                    },
                    scopes: new W.Group({
                        el: U.byId('s-scopes'), name: 'scopes', linear: ['left', 'right'],
                        onOk: function (el) {
                            S.kind = el.getAttribute('data-k');
                            U.qsa('#s-scopes .chip').forEach(function (c) { U.toggle(c, 'on', c === el); });
                            S.run(input.value);
                        },
                        nb: { up: 'field', down: 'results' }
                    }),
                    results: list
                },
                onBack: S.close,
                onKey: function (a) {
                    if (a === 'input-back') { Nav.focus('field'); return true; }
                    return false;
                }
            };
            Nav.push(layer);
            Nav.focus('field');
            // Odmah otvori tipkovnicu (kao Android dijalog pretrage).
            setTimeout(function () { try { input.focus(); } catch (e) { } }, 150);
            S.paintCount();
        },
        close: function () {
            if (!layer) return;
            var l = layer;
            layer = null;
            var input = U.byId('s-input');
            if (input) input.blur();
            Nav.pop(l);
            U.hide('search-ov');
            U.byId('search-ov').innerHTML = '';
        },
        run: function (q) {
            S.query = q;
            S.results = q && q.trim().length >= 1 ? App.Lib.search(S.kind, q, 300) : [];
            list.reset(0);
            S.paintCount();
        },
        paintCount: function () {
            var el = U.byId('s-count');
            if (!el) return;
            el.textContent = S.query ? (S.results.length + (S.results.length >= 300 ? '+' : '') + ' ' + t('results')) : '';
        },
        pick: function (it) {
            var kind = S.kind;
            S.close();
            if (kind === 'live') App.Shell.openLiveAt(it, false);
            else App.Info.open(kind, it);
        }
    };
})();
