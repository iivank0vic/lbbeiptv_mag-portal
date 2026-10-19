/*
 * Settings (grupirane plocice), Playlists, Account i Network test (APP.md §1, §4.4).
 * DNS postavka se na TV-u ne prikazuje: mreza ide kroz sustav TV-a (APP.md §6.3).
 */
(function () {
    var layer = null, group = null;

    var S = App.SettingsPanel = {
        init: function (l) { layer = l; },

        tiles: function () {
            var L = App.Lib, St = App.Settings;
            var sortLbl = { 'default': 'string_default', number: 'order_by_number', 'a-z': 'sort_a_z', 'z-a': 'sort_z_a', added: 'order_by_added' };
            var groups = [
                {
                    title: t('general'), items: [
                        { id: 'language', icon: 'language', title: t('change_language'), value: App.I18N.langName(currentLang()) },
                        { id: 'time', icon: 'clock', title: t('time_format'), value: St.get('time_format') === '12' ? t('format_12_hour') : t('format_24_hour') },
                        { id: 'network', icon: 'network', title: t('network_test'), value: t('ping') + ' · ' + t('download_speed') },
                        { id: 'format', icon: 'format', title: t('stream_format'), value: St.get('stream_format') === 'm3u8' ? 'HLS (.m3u8)' : 'MPEG-TS (.ts)' }
                    ]
                },
                {
                    title: t('playback'), items: [
                        { id: 'livesort', icon: 'sort', title: t('live_sort'), value: t(sortLbl[St.get('live_sort')] || 'string_default') }
                    ]
                },
                {
                    title: t('content'), items: [
                        { id: 'hide-live', icon: 'live', title: t('hide_live_category'), value: L.hiddenIds('live').length + ' ' + t('hidden') },
                        { id: 'hide-vod', icon: 'movies', title: t('hide_vod_category'), value: L.hiddenIds('vod').length + ' ' + t('hidden') },
                        { id: 'hide-series', icon: 'series', title: t('hide_series_category'), value: L.hiddenIds('series').length + ' ' + t('hidden') },
                        { id: 'pin', icon: 'key', title: t('parent_control'), value: 'PIN' }
                    ]
                }
            ];
            if (App.Platform.engines.length > 1) {
                var eng = App.Player.engineId();
                var lbl = '';
                App.Platform.engines.forEach(function (e) { if (e.id === eng) lbl = e.label; });
                groups[1].items.unshift({ id: 'engine', icon: 'engine', title: t('player_engine'), value: lbl });
            }
            return groups;
        },

        render: function () {
            var el = U.byId('panel-settings');
            var html = '<div class="set-scroll"><div class="set-inner" id="set-inner"><div class="t-title">' + U.esc(t('settings')) + '</div>';
            S.tiles().forEach(function (g) {
                html += '<div class="set-group"><div class="t-overline">' + U.esc(g.title) + '</div><div class="set-tiles">';
                g.items.forEach(function (it) {
                    html += '<div class="set-tile f" data-id="' + it.id + '"><div class="tile">' + App.icon(it.icon) +
                        '<div class="txt"><div class="tt">' + U.esc(it.title) + '</div><div class="tv">' + U.esc(it.value) + '</div></div></div></div>';
                });
                html += '</div></div>';
            });
            html += '</div></div>';
            var keep = group ? group.index : 0;
            el.innerHTML = html;
            group = new W.Group({
                el: U.byId('set-inner'), name: 'settings', index: keep,
                scroller: { view: el.querySelector('.set-scroll'), inner: U.byId('set-inner'), margin: 80 },
                onOk: function (tile) { S.open(tile.getAttribute('data-id')); },
                nb: { left: 'rail' }
            });
            layer.zones.settings = group;
        },
        rerender: function () {
            S.render();
            Nav.focus('settings');
        },

        open: function (id) {
            var St = App.Settings, L = App.Lib, D = App.Dialog;
            if (id === 'language') {
                var langs = App.I18N.languages();
                var opts = langs.length ? langs.map(function (l) { return { label: l.name || l.code, value: l.code }; }) : [{ label: 'English', value: 'en' }];
                D.choose(t('change_language'), opts, currentLang()).then(function (v) {
                    if (!v) return;
                    St.set('language', v);
                    App.applyLanguage();
                    App.Shell.renderRail();
                    App.Shell.markRail();
                    App.Shell.updateExpiry();
                    S.rerender();
                });
            } else if (id === 'time') {
                D.choose(t('time_format'), [{ label: t('format_12_hour'), value: '12' }, { label: t('format_24_hour'), value: '24' }], St.get('time_format')).then(function (v) {
                    if (v) { St.set('time_format', v); S.rerender(); }
                });
            } else if (id === 'format') {
                D.choose(t('stream_format'), [{ label: 'MPEG-TS (.ts)', value: 'ts' }, { label: 'HLS (.m3u8)', value: 'm3u8' }], St.get('stream_format')).then(function (v) {
                    if (v) { St.set('stream_format', v); S.rerender(); }
                });
            } else if (id === 'engine') {
                var eopts = App.Platform.engines.map(function (e) { return { label: e.label, value: e.id }; });
                D.choose(t('player_engine'), eopts, App.Player.engineId()).then(function (v) {
                    if (!v || v === App.Player.engineId()) return;
                    St.set('engine', v);
                    App.Player.create(v);
                    S.rerender();
                });
            } else if (id === 'livesort') {
                D.choose(t('select_live_sort'), [
                    { label: t('string_default'), value: 'default' }, { label: t('order_by_number'), value: 'number' },
                    { label: t('sort_a_z'), value: 'a-z' }, { label: t('sort_z_a'), value: 'z-a' }, { label: t('order_by_added'), value: 'added' }
                ], St.get('live_sort')).then(function (v) { if (v) { St.set('live_sort', v); S.rerender(); } });
            } else if (id === 'hide-live' || id === 'hide-vod' || id === 'hide-series') {
                var kind = id.substr(5);
                var hidden = L.hiddenSet(kind);
                var copts = L.allCategories(kind).map(function (c) { return { label: c.name, value: c.id, sub: String(c.items.length), on: !!hidden[c.id] }; });
                if (!copts.length) { App.toast(t('no_information')); return; }
                var go = function () {
                    D.multi(t(id === 'hide-live' ? 'hide_live_category' : (id === 'hide-vod' ? 'hide_vod_category' : 'hide_series_category')),
                        t('select_categories_you_want_to_hide'), copts).then(function (ids) {
                            if (!ids) return;
                            L.setHidden(kind, ids);
                            S.rerender();
                        });
                };
                go();
            } else if (id === 'pin') {
                D.changePin();
            } else if (id === 'network') {
                S.network();
            }
        },

        /* ---------------- Playlists ---------------- */
        playlists: function () {
            var urls = (App.info && App.info.urls) || [];
            var cur = App.Settings.get('playlist_index');
            var opts = urls.map(function (u, i) {
                return { label: t('playlist') + ' ' + (i + 1) + '  ·  ' + App.playlistHost(u), value: i, sub: i === cur ? t('active') : '', on: i === cur };
            });
            var qr = App.Api.withMac(App.Api.MYLIST_URL, App.mac);
            App.Dialog.open({
                title: t('playlists'), caption: t('manage_playlists'), width: 1240,
                body: opts.length ? '' : U.esc(t('no_playlist')),
                options: opts.length ? opts : null, mode: 'radio',
                buttons: [
                    { label: t('add_playlist'), act: 'add' },
                    { label: t('reload_playlist'), act: 'reload' },
                    { label: t('close'), act: 'close', primary: true }
                ],
                onOption: function (i, dlg) {
                    dlg.close();
                    if (i === cur) return;
                    App.loadPlaylist(i);
                },
                onButton: function (act, dlg) {
                    if (act === 'close') { dlg.close(); return; }
                    if (act === 'reload') { dlg.close(); App.Shell.stop(); App.boot(); return; }
                    if (act === 'add') {
                        dlg.close();
                        App.Dialog.open({
                            title: t('add_playlist'), width: 1100,
                            body: '<div class="acc"><div class="acc-left" style="font-size:28px;line-height:1.45">' + U.esc(t('add_playlist_dialog_message')) +
                                '<div class="acc-row"><div class="ib">' + App.icon('device') + '</div><div class="al">' + U.esc(t('mac_address')) +
                                '<div class="av">' + U.esc(App.mac) + '</div></div></div></div>' +
                                '<div class="acc-qr"><div class="qr-frame"><img src="' + U.qrDataUrl(qr) + '" alt="" /></div><div class="url">' +
                                U.esc(qr.replace(/^https?:\/\//, '')) + '</div></div></div>',
                            buttons: [{ label: t('close'), act: 'close' }, { label: t('reload_playlist'), act: 'reload', primary: true }],
                            focusButton: 1,
                            onButton: function (a, d2) { d2.close(); if (a === 'reload') { App.Shell.stop(); App.boot(); } }
                        });
                    }
                }
            });
        },

        /* ---------------- Account ---------------- */
        account: function () {
            var info = App.info || {};
            var expired = App.isExpired();
            var state, pill;
            if (!info.mac_registered) { state = t('account_state_demo'); pill = 'warn'; }
            else if (expired) { state = t('account_state_expired'); pill = 'bad'; }
            else if (info.is_trial == 1) { state = t('account_state_trial'); pill = 'warn'; }
            else { state = t('account_state_active'); pill = 'ok'; }
            var pe = App.Lib.playlistExpiry();
            var peText = pe === null ? '—' : (pe === 0 ? '∞ ' + t('unlimited') : U.fmtDate(pe));
            var appExp = info.expire_date ? U.fmtDate(U.parseDate(info.expire_date) || new Date()) : '—';
            var qrUrl = App.Api.withMac(info.is_trial == 1 || !info.mac_registered || expired ? App.Api.ACTIVATE_URL : App.Api.MYLIST_URL, App.mac);
            function row(icon, label, value) {
                return '<div class="acc-row"><div class="ib">' + App.icon(icon) + '</div><div class="al">' + U.esc(label) + '<div class="av">' + U.esc(value) + '</div></div></div>';
            }
            var body = '<div class="acc"><div class="acc-left"><div class="acc-head"><img src="images/logo.png" alt="" /><div class="t-section">' +
                U.esc(t('app_user_account')) + '</div><span class="pill ' + pill + '">' + U.esc(state) + '</span></div>' +
                row('device', t('mac_address'), App.mac) +
                row('calendar', t('account_expiration_date'), appExp) +
                row('playlists', t('list_expiration_date'), peText) +
                row('list', t('playlists'), String((info.urls || []).length)) +
                row('info', t('application_version'), App.Platform.version + '  ·  ' + App.Platform.label) +
                '</div><div class="acc-qr"><div class="qr-frame"><img src="' + U.qrDataUrl(qrUrl) + '" alt="" /></div>' +
                '<div class="t-caption">' + U.esc(t('scan_qr')) + '</div><div class="url">' + U.esc(qrUrl.replace(/^https?:\/\//, '')) + '</div></div></div>';
            App.Dialog.open({
                width: 1300, body: body,
                buttons: [{ label: t('close'), act: 'close', primary: true }],
                onButton: function (a, d) { d.close(); }
            });
        },

        /* ---------------- Network test ---------------- */
        network: function () {
            var body = '<div class="net-cards"><div class="net-card"><div class="t-overline">' + U.esc(t('device_info')) + '</div>' +
                kv(t('mac_address'), App.mac, 'n-mac') + kv(t('model'), '…', 'n-model') + kv(t('platform'), App.Platform.label, 'n-plat') +
                kv(t('connection_type'), '…', 'n-conn') + kv(t('local_ip_address'), '…', 'n-lip') + kv(t('public_ip_address'), '…', 'n-pip') +
                kv(t('dns'), t('system'), 'n-dns') + '</div>' +
                '<div class="net-card"><div class="t-overline">' + U.esc(t('network_test')) + '</div>' +
                '<div class="speed"><div><div class="sl">' + U.esc(t('ping')) + '</div><div class="sv" id="n-ping">—</div><div class="su">ms</div></div>' +
                '<div><div class="sl">' + U.esc(t('download_speed')) + '</div><div class="sv" id="n-down">—</div><div class="su">Mbps</div></div>' +
                '<div><div class="sl">' + U.esc(t('upload_speed')) + '</div><div class="sv" id="n-up">—</div><div class="su">Mbps</div></div></div>' +
                '<div class="progress" style="width:100%;margin-top:30px"><div id="n-bar"></div></div>' +
                '<div class="t-caption" id="n-status" style="margin-top:14px;text-align:center"></div></div></div>';
            var running = false;
            var dlg = App.Dialog.open({
                title: t('network_test'), width: 1500, body: body,
                buttons: [{ label: t('close'), act: 'close' }, { label: t('start_speed_test'), act: 'start', primary: true }],
                focusButton: 1,
                onButton: function (act, d) {
                    if (act === 'close') { d.close(); return; }
                    if (!running) { running = true; S.speedTest(d).then(function () { running = false; }); }
                },
                onBack: function (d) { d.close(); }
            });
            App.Platform.deviceInfo().then(function (inf) {
                if (dlg.closed) return;
                setText('n-model', inf.model || '—');
                setText('n-plat', inf.platform || App.Platform.label);
                setText('n-conn', inf.connection || '—');
                setText('n-lip', inf.localIp || '—');
            });
            U.getJSON('https://api.ipify.org?format=json', 6000).then(function (d) { setText('n-pip', d && d.ip ? d.ip : '—'); }, function () { setText('n-pip', '—'); });
        },
        /** Ping (3 mala zahtjeva), download 10 MB, upload 5 MB (Cloudflare). */
        speedTest: function (dlg) {
            var bar = function (p) { var b = U.byId('n-bar'); if (b) b.style.width = p + '%'; };
            var status = function (k) { setText('n-status', k ? t(k) : ''); };
            setText('n-ping', '…'); setText('n-down', '—'); setText('n-up', '—');
            bar(2);
            status('testing_ping');
            var pings = [];
            function ping(i) {
                var s = U.now();
                return U.http({ url: 'https://speed.cloudflare.com/__down?bytes=0&r=' + s + i, timeout: 5000 }).then(function () {
                    pings.push(U.now() - s);
                }, function () { });
            }
            return ping(0).then(function () { return ping(1); }).then(function () { return ping(2); }).then(function () {
                pings.sort(function (a, b) { return a - b; });
                setText('n-ping', pings.length ? String(pings[0]) : 'Error');
                bar(10);
                status('testing_download');
                var size = 10000000, s = U.now();
                var timer = setInterval(function () { var b = U.byId('n-bar'); if (b) bar(Math.min(55, parseFloat(b.style.width) + 1.5)); }, 150);
                return U.http({ url: 'https://speed.cloudflare.com/__down?bytes=' + size + '&r=' + s, timeout: 60000 }).then(function (txt) {
                    clearInterval(timer);
                    var sec = (U.now() - s) / 1000;
                    var bytes = (txt && txt.length) || size;
                    setText('n-down', (bytes * 8 / sec / 1000000).toFixed(1));
                }, function () { clearInterval(timer); setText('n-down', 'Error'); });
            }).then(function () {
                bar(60);
                status('testing_upload');
                var size = 5000000, s = U.now();
                var timer = setInterval(function () { var b = U.byId('n-bar'); if (b) bar(Math.min(95, parseFloat(b.style.width) + 1.5)); }, 150);
                var data = new Uint8Array(size);
                return U.http({ url: 'https://speed.cloudflare.com/__up', method: 'POST', body: data, timeout: 60000, headers: { 'Content-Type': 'application/octet-stream' } }).then(function () {
                    clearInterval(timer);
                    setText('n-up', (size * 8 / ((U.now() - s) / 1000) / 1000000).toFixed(1));
                }, function () { clearInterval(timer); setText('n-up', 'Error'); });
            }).then(function () { bar(100); status(''); });
        }
    };

    function currentLang() {
        var c = App.Settings.get('language');
        if (c) return c;
        var langs = App.I18N.languages();
        return langs.length ? langs[0].code : 'en';
    }
    function kv(k, v, id) {
        return '<div class="kv"><span class="k">' + U.esc(k) + '</span><span class="v" id="' + id + '">' + U.esc(v) + '</span></div>';
    }
    function setText(id, v) { var e = U.byId(id); if (e) e.textContent = v; }
})();
