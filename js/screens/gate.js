/*
 * Pocetni tok: splash -> registracija uredaja (MAC) -> playlist_information -> odabir playliste ->
 * ucitavanje. "Gate" je ekran stanja kad se ne moze dalje (neregistriran, istekao, nema playliste,
 * greska mreze / playliste) — uvijek s MAC adresom, QR kodom i jasnim gumbima.
 */
(function () {
    var Splash = App.Splash = {
        show: function (key, pct) {
            U.show('splash');
            U.byId('splash-status').textContent = key ? t(key) : '';
            U.byId('splash-bar').style.width = (pct || 0) + '%';
        },
        hide: function () { U.hide('splash'); }
    };

    var layer = null;

    var Gate = App.Gate = {
        /**
         * kind: 'activate' | 'expired' | 'noplaylist' | 'network' | 'error'
         * opts: {detail, canContinue}
         */
        show: function (kind, opts) {
            opts = opts || {};
            Splash.hide();
            U.hide('shell');
            var el = U.byId('gate');
            var mac = App.mac || '';
            var title, msg, qrUrl, overline;
            var code = (kind === 'activate' || kind === 'expired') ? App.Api.pairCode() : '';
            if (kind === 'activate') {
                overline = t('activate_device'); title = t('your_mac_address'); msg = t('mac_not_registered');
                qrUrl = App.Api.withMac(App.Api.ACTIVATE_URL, mac);
            } else if (kind === 'expired') {
                overline = t('subscription_expired'); title = t('account_state_expired');
                msg = App.info && App.info.is_trial == 1 ? t('trial_ended') : t('account_ended');
                qrUrl = App.Api.withMac(App.Api.ACTIVATE_URL, mac);
            } else if (kind === 'noplaylist') {
                overline = t('playlists'); title = t('add_your_playlist'); msg = t('no_playlist');
                qrUrl = App.Api.withMac(App.Api.MYLIST_URL, mac);
            } else if (kind === 'network') {
                overline = 'IPTV LBBE Player'; title = t('loading_failed'); msg = t('error_network');
                qrUrl = '';
            } else {
                overline = t('playlist'); title = t('loading_failed'); msg = opts.message || t('error_generic');
                qrUrl = App.Api.withMac(App.Api.MYLIST_URL, mac);
            }
            var btns = '';
            if (opts.canContinue) btns += '<div class="btn primary f" data-act="continue">' + U.esc(t('continue')) + '</div>';
            btns += '<div class="btn f' + (opts.canContinue ? '' : ' primary') + '" data-act="retry">' + App.icon('reload') + U.esc(kind === 'network' || kind === 'error' ? t('retry') : t('reload_playlist')) + '</div>';
            if (kind === 'error' && App.info && App.info.urls && App.info.urls.length > 1) {
                btns += '<div class="btn f" data-act="playlists">' + App.icon('playlists') + U.esc(t('change_playlist')) + '</div>';
            }
            btns += '<div class="btn f" data-act="exit">' + App.icon('exit') + U.esc(t('exit')) + '</div>';

            var html = '<div class="gate-card"><div class="gate-left">' +
                '<img class="logo" src="images/logo.png" alt="" />' +
                '<div class="t-overline">' + U.esc(overline) + '</div>' +
                '<div class="t-title">' + U.esc(title) + '</div>' +
                '<div class="gate-msg">' + U.esc(msg) + (opts.detail ? '<span class="err">' + U.esc(opts.detail) + '</span>' : '') + '</div>' +
                (mac ? '<div class="gate-mac">' + U.esc(t('mac_address')) + '<span>' + U.esc(mac) + '</span></div>' : '') +
                (code ? '<div class="gate-mac">' + U.esc(t('activation_code', 'Activation code')) + '<span>' + U.esc(code) + '</span></div>' : '') +
                '<div class="gate-btns">' + btns + '</div></div>';
            if (qrUrl) {
                html += '<div class="gate-right"><div class="qr-frame"><img src="' + U.qrDataUrl(qrUrl) + '" alt="" /></div>' +
                    '<div class="t-caption">' + U.esc(t('scan_qr')) + '</div>' +
                    '<div class="gate-url">' + U.esc(qrUrl.replace(/^https?:\/\//, '')) + '</div></div>';
            }
            html += '</div>';
            el.innerHTML = html;
            U.show(el);

            if (layer) Nav.pop(layer);
            layer = {
                name: 'gate',
                zones: {
                    btns: new W.Group({
                        el: el.querySelector('.gate-btns'), name: 'btns',
                        onOk: function (b) {
                            var act = b.getAttribute('data-act');
                            if (act === 'continue') { Gate.close(); App.choosePlaylist(); }
                            else if (act === 'retry') { Gate.close(); App.boot(); }
                            else if (act === 'playlists') { App.pickPlaylist(true); }
                            else if (act === 'exit') App.confirmExit();
                        }
                    })
                },
                zone: 'btns',
                onBack: function () { App.confirmExit(); }
            };
            Nav.push(layer);
        },
        close: function () {
            if (layer) { Nav.pop(layer); layer = null; }
            U.hide('gate');
        }
    };
})();
