/*
 * Home: "Continue watching" (zadnji kanal) + brze plocice Live/Movies/Series s brojem stavki,
 * ispod redovi: najnoviji filmovi, najnovije serije, omiljeni kanali (APP.md §1).
 */
(function () {
    var layer = null, rows = [], offset = 0;

    var Home = App.Home = {
        init: function (l) { layer = l; },

        render: function () {
            var L = App.Lib;
            var el = U.byId('panel-home');
            var recent = L.idsToItems('live', L.recentIds('live'))[0] || null;
            Home.recent = recent;
            var html = '<div class="home-scroll"><div class="home-inner" id="home-inner"><div class="hero-row">';
            if (recent) {
                html += '<div class="hero-card" id="hero-card"><div class="hero-logo">' + img(recent.icon, 'channel') + '</div>' +
                    '<div class="hero-text"><div class="t-overline">' + U.esc(t('continue_watching')) + '</div>' +
                    '<div class="hero-title">' + U.esc(recent.name) + '</div>' +
                    '<div class="hero-sub">' + U.esc(L.categoryName('live', recent.cat) || t('live_tv')) + '</div></div>' +
                    '<div class="btn primary f" id="hero-resume">' + App.icon('play') + U.esc(t('resume')) + '</div></div>';
            }
            html += '<div class="quick-tiles" id="quick-tiles">' +
                tile('live', 'live', t('live_tv'), L.count('live')) +
                tile('movies', 'movies', t('movies'), L.count('vod')) +
                tile('series', 'series', t('tv_shows'), L.count('series')) +
                '</div></div>';

            var defs = [
                { key: 'vod', title: t('latest_movies'), items: L.latest('vod', 20) },
                { key: 'series', title: t('latest_tv_shows'), items: L.latest('series', 20) },
                { key: 'live', title: t('featured_live_tv'), items: L.idsToItems('live', L.favIds('live')).slice(0, 30) }
            ].filter(function (d) { return d.items.length > 0; });
            defs.forEach(function (d, i) {
                html += '<div class="home-row' + (d.key === 'live' ? ' channels' : '') + '"><div class="row-title">' + U.esc(d.title) +
                    '</div><div class="row-track" id="home-row-' + i + '"></div></div>';
            });
            html += '</div></div>';
            el.innerHTML = html;

            // Zone
            offset = 0;
            Object.keys(layer.zones).forEach(function (k) { if (/^(hero|tiles|row\d+)$/.test(k)) delete layer.zones[k]; });
            rows = [];
            var firstRow = defs.length ? 'row0' : null;
            if (recent) {
                layer.zones.hero = new W.Group({
                    el: U.byId('hero-card'), name: 'hero',
                    onOk: function () { App.Shell.openLiveAt(recent, true); },
                    onFocus: function () { Home.scroll(0); },
                    nb: { right: 'tiles', left: 'rail', down: firstRow }
                });
            }
            layer.zones.tiles = new W.Group({
                el: U.byId('quick-tiles'), name: 'tiles',
                onOk: function (t0) { App.Shell.select(t0.getAttribute('data-sec'), { focus: true }); },
                onFocus: function () { Home.scroll(0); },
                nb: { left: recent ? 'hero' : 'rail', down: firstRow }
            });
            defs.forEach(function (d, i) {
                var z = new W.HRow({
                    el: U.byId('home-row-' + i), name: 'row' + i, items: d.items,
                    cardCls: d.key === 'live' ? 'ch' : '',
                    inner: function (it) {
                        return '<div class="pic">' + img(it.icon, d.key === 'live' ? 'channel' : (d.key === 'series' ? 'series' : 'poster')) +
                            (d.key !== 'live' && it.rating ? '<div class="badge-rating">' + (Math.round(it.rating * 10) / 10) + '</div>' : '') +
                            '</div><div class="cap">' + U.esc(it.name) + '</div>';
                    },
                    onOk: function (idx) {
                        var it = d.items[idx];
                        if (d.key === 'live') App.Shell.openLiveAt(it, true);
                        else App.Info.open(d.key, it);
                    },
                    onFocus: function () { Home.scroll(i + 1); },
                    nb: {
                        left: 'rail',
                        up: i === 0 ? (recent ? ['hero', 'tiles'] : ['tiles']) : 'row' + (i - 1),
                        down: i < defs.length - 1 ? 'row' + (i + 1) : null
                    }
                });
                layer.zones['row' + i] = z;
                rows.push(z);
            });
            if (!defs.length) {
                el.querySelector('.home-inner').insertAdjacentHTML('beforeend', '<div class="row-empty"></div>');
            }
        },

        startZone: function () {
            if (layer.zones.hero) return 'hero';
            return 'tiles';
        },

        /** Okomito pomicanje: red k (0 = gornji red s plocicama) drzi vidljivim. */
        scroll: function (k) {
            var inner = U.byId('home-inner');
            if (!inner) return;
            var y = 0;
            if (k > 0) {
                var rowsEl = U.qsa('.home-row', inner);
                var row = rowsEl[k - 1];
                if (row) {
                    var viewH = inner.parentNode.clientHeight;
                    var max = Math.max(0, inner.offsetHeight - viewH + 40);
                    // Prvi red: samo koliko treba da stane; ostali: naslov reda pri vrhu.
                    y = k === 1 ? Math.max(0, row.offsetTop + row.offsetHeight + 20 - viewH) : row.offsetTop - 30;
                    y = U.clamp(y, 0, max);
                }
            }
            offset = y;
            inner.style.webkitTransform = 'translateY(' + (-y) + 'px)';
            inner.style.transform = 'translateY(' + (-y) + 'px)';
        }
    };

    function tile(sec, icon, label, count) {
        return '<div class="quick-tile f" data-sec="' + sec + '">' + App.icon(icon) +
            '<div class="q-lbl">' + U.esc(label) + '</div><div class="q-cnt">' + U.fmtNumber(count) + '</div></div>';
    }

    /**
     * Slika s placeholderom (Android placeholder_*): tamni gradijent + ikona, bez logotipa aplikacije.
     * kind: 'poster' (film), 'series', 'episode', 'channel', 'signal'. Ako se slika ne ucita (404),
     * sakrije se i vidi se placeholder ispod nje.
     */
    var PH_ICON = { poster: 'phMovie', series: 'phSeries', episode: 'phSeries', channel: 'phTv', signal: 'wifiOff' };
    function img(src, kind) {
        var s = U.safeUrl(src);
        var ph = '<div class="ph ph-' + (kind || 'poster') + '">' + App.icon(PH_ICON[kind] || 'phMovie') + '</div>';
        if (!s) return ph;
        // Ucitana slika sakrije placeholder (logotipi kanala su cesto prozirni PNG).
        return ph + '<img src="' + s + '" alt="" onload="var p=this.previousSibling;if(p)p.style.display=\'none\'" onerror="this.onerror=null;this.style.display=\'none\'" />';
    }
    App.img = img;
})();
