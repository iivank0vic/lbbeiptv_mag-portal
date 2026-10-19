/*
 * Pocetni tok (APP.md "Start i ucitavanje", Android MainActivity / LoadingScreen):
 *  - Loader: logo + naziv koraka + traka + "Step N of M"; nakon 15 s "Taking too long? Options";
 *    greska = ikona u krugu (zuta mreza/server, crvena prijava/istek/neispravno, plava prazno) +
 *    naslov + sto napraviti + tehnicki detalj + akcije (Retry, Continue with saved data, Clear cache,
 *    Change playlist, More).
 *  - Gate: aktivacija / trial / istek / potvrda uredaja (pairing) / nema playliste / portal ne radi —
 *    pill stanja, naslov, poruka, MAC (i kod), gumbi, QR desno. Trial / istek uskoro: Start s
 *    odbrojavanjem 8 s, svaka tipka ga prekida.
 */
(function () {
    var SLOW_MS = 15000;

    /* ======================= Loader ======================= */
    var lLayer = null, slowTimer = null, onSlow = null;

    var Loader = App.Loader = {
        visible: false,

        /** key = tekst koraka (t-kljuc), step/total = "Step N of M" (0 = bez), detail = npr. MB/s. */
        step: function (key, pct, step, total, detail) {
            Loader.show();
            if (U.byId('splash').classList.contains('err')) Loader.popLayer();
            U.byId('splash').classList.remove('err');
            U.hide('ld-error');
            U.show('ld-progress');
            U.byId('ld-step').textContent = key ? t(key) : '';
            U.byId('splash-bar').style.width = U.clamp(pct || 0, 0, 100) + '%';
            var sub = step && total ? t('loading_step', 'Step %1 of %2').replace('%1', step).replace('%2', total) : '';
            if (detail) sub = sub ? sub + '  ·  ' + detail : detail;
            U.byId('ld-sub').textContent = sub;
        },
        show: function () {
            U.show('splash');
            Loader.visible = true;
            var foot = U.byId('ld-foot');
            if (foot) foot.textContent = (App.mac ? 'MAC ' + App.mac + '  ·  ' : '') + 'v' + App.Platform.version;
        },
        hide: function () {
            Loader.disarmSlow();
            Loader.popLayer();
            U.hide('splash');
            Loader.visible = false;
        },
        /** Nakon 15 s ispod trake ponudi opcije (prekida cekanje). */
        armSlow: function (cb) {
            Loader.disarmSlow();
            onSlow = cb;
            slowTimer = setTimeout(function () {
                var el = U.byId('ld-slow');
                if (!el || !Loader.visible) return;
                el.textContent = t('action_loading_options', 'Taking too long? Options');
                U.show(el);
                Loader.pushLayer(U.byId('ld-progress'), function () { var f = onSlow; Loader.disarmSlow(); if (f) f(); });
            }, SLOW_MS);
        },
        disarmSlow: function () {
            clearTimeout(slowTimer);
            slowTimer = null;
            U.hide('ld-slow');
        },
        pushLayer: function (el, onOk, onBack) {
            Loader.popLayer();
            lLayer = {
                name: 'loader', zone: 'btns',
                zones: { btns: new W.Group({ el: el, name: 'btns', onOk: function (b) { onOk(b.getAttribute('data-act'), b); } }) },
                onBack: onBack || function () { App.confirmExit(); }
            };
            Nav.push(lLayer);
        },
        popLayer: function () {
            if (lLayer) { var l = lLayer; lLayer = null; Nav.pop(l); }
        },

        /**
         * e: {tone 'warn'|'danger'|'info', icon, title, msg, detail}
         * actions: [{id, label, icon, primary}]; onAction(id).
         */
        error: function (e, actions, onAction) {
            Loader.show();
            Loader.disarmSlow();
            U.byId('splash').classList.add('err');
            U.hide('ld-progress');
            var el = U.byId('ld-error');
            var html = '<div class="ld-icon ' + (e.tone || 'danger') + '">' + App.icon(e.icon || 'alert') + '</div>' +
                '<div class="t-title">' + U.esc(e.title) + '</div>' +
                '<div class="ld-msg">' + U.esc(e.msg || '') + '</div>' +
                (e.detail ? '<div class="ld-detail">' + U.esc(e.detail) + '</div>' : '') +
                '<div class="ld-btns">';
            actions.forEach(function (a, i) {
                html += '<div class="btn f' + (i === 0 ? ' primary' : '') + '" data-act="' + a.id + '">' + (a.icon ? App.icon(a.icon) : '') + U.esc(a.label) + '</div>';
            });
            el.innerHTML = html + '</div>';
            U.show(el);
            Loader.pushLayer(el.querySelector('.ld-btns'), onAction);
        }
    };
    // Stari naziv (koriste ga starije skripte).
    App.Splash = { show: function (key, pct) { Loader.step(key, pct); }, hide: Loader.hide };

    /* ======================= Gate ======================= */
    var layer = null, countdown = null;

    function daysLeft() {
        var d = App.info && U.parseDate(App.info.expire_date);
        if (!d) return null;
        return Math.max(0, Math.ceil((d.getTime() - U.now()) / 86400000));
    }

    var Gate = App.Gate = {
        /**
         * kind: 'activate' | 'trial' | 'expiring' | 'expired' | 'pairing' | 'noplaylist' | 'network'
         * opts: {detail, canContinue, code (pairing), onStart}
         */
        show: function (kind, opts) {
            opts = opts || {};
            Loader.hide();
            U.hide('shell');
            Gate.stopCountdown();
            var el = U.byId('gate');
            var mac = App.mac || '';
            var info = App.info || {};
            var dl = daysLeft();
            var exp = info.expire_date ? U.fmtDate(U.parseDate(info.expire_date) || new Date()) : '';
            var c = { tone: 'warn', badge: '', title: '', msg: '', msg2: '', qr: '', code: '', start: false, countdown: false };
            var platformCode = App.Api.pairCode();
            if (kind === 'activate') {
                c.badge = t('activation_badge_unregistered', 'Not registered');
                c.title = t('activation_title_register', 'Activate this device');
                c.msg = t('mac_not_registered');
                c.msg2 = t('demo_days', '');
                c.qr = App.Api.withMac(App.Api.MYLIST_URL, mac);
                c.code = platformCode;
                c.start = !!opts.canContinue;
            } else if (kind === 'trial') {
                c.badge = t('activation_badge_trial', 'Trial · %1 days left').replace('%1', dl === null ? '?' : dl);
                c.title = t('activation_title_trial', 'Free trial');
                c.msg = (t('trial_end_time', 'Your trial ends on') + ' ' + exp + ' ' + t('please_pay', '')).trim();
                c.qr = App.Api.withMac(App.Api.ACTIVATE_URL, mac);
                c.start = true; c.countdown = true;
            } else if (kind === 'expiring') {
                c.badge = t('activation_badge_expiring', 'Expires in %1 days').replace('%1', dl === null ? '?' : dl);
                c.title = t('activation_title_welcome', 'Welcome back');
                c.msg = (t('account_expiration_date') + ': ' + exp + ' ' + t('please_pay', '')).trim();
                c.qr = App.Api.withMac(App.Api.ACTIVATE_URL, mac);
                c.start = true; c.countdown = true;
            } else if (kind === 'expired') {
                c.tone = 'danger';
                c.badge = t('activation_badge_expired', 'Expired');
                c.title = t('activation_title_expired', 'Subscription ended');
                c.msg = info.is_trial == 1 ? t('trial_ended') : t('account_ended');
                c.qr = App.Api.withMac(App.Api.ACTIVATE_URL, mac);
                c.code = platformCode;
            } else if (kind === 'pairing') {
                c.badge = t('pairing_badge', 'Security check');
                c.title = t('pairing_title', 'Confirm this device');
                var site = App.Api.MYLIST_URL.replace(/^https?:\/\//, '');
                c.msg = (opts.code ? t('pairing_msg_code', 'Open %1 on your phone (scan the QR code) and enter the code below to confirm this device. Then press Reload.')
                    : t('pairing_msg_no_code', 'Open %1 on your phone (scan the QR code) and confirm this device. Then press Reload.')).replace('%1', site);
                c.msg2 = t('pairing_why', 'This protects your playlists: they are only sent to devices you have confirmed.');
                c.qr = App.Api.pairingUrl(mac, opts.code);
                c.pairing = opts.code ? String(opts.code).replace(/(\d{3})(?=\d)/g, '$1 ') : '';
            } else if (kind === 'noplaylist') {
                c.tone = 'info';
                c.badge = t('playlists');
                c.title = t('error_no_playlist_title', 'No playlist on this device');
                c.msg = t('error_no_playlist_msg', 'Add a playlist for this MAC address at %1, then press Retry.').replace('%1', App.Api.MYLIST_URL.replace(/^https?:\/\//, ''));
                c.qr = App.Api.withMac(App.Api.MYLIST_URL, mac);
            } else {
                c.badge = t('error', 'Error');
                c.title = t('error_portal_title', 'Can\'t reach the LBBE server');
                c.msg = t('error_portal_msg', 'Your device information could not be loaded. Try again in a moment.');
            }
            var btns = '';
            if (c.start) btns += '<div class="btn primary f" data-act="start" id="gate-start">' + App.icon('play') + U.esc(t('register', t('action_start', 'Start'))) + '</div>';
            btns += '<div class="btn f' + (c.start ? '' : ' primary') + '" data-act="retry">' + App.icon('reload') + U.esc(t('app_reload', 'Reload')) + '</div>';
            if (kind === 'network') btns += '<div class="btn f" data-act="network">' + App.icon('network') + U.esc(t('network_test')) + '</div>';
            btns += '<div class="btn f" data-act="exit">' + App.icon('exit') + U.esc(t('exit')) + '</div>';

            var html = '<div class="gate-card"><div class="gate-left">' +
                '<div class="gate-top"><img class="logo" src="images/logo.png" alt="" /><span class="pill ' + c.tone + '">' + U.esc(c.badge) + '</span></div>' +
                '<div class="t-title">' + U.esc(c.title) + '</div>' +
                '<div class="gate-msg">' + U.esc(c.msg) + (c.msg2 ? '<span class="sub">' + U.esc(c.msg2) + '</span>' : '') +
                (opts.detail ? '<span class="err">' + U.esc(opts.detail) + '</span>' : '') + '</div>' +
                (c.pairing ? '<div class="gate-code">' + U.esc(c.pairing) + '</div>' : '') +
                (mac ? '<div class="gate-mac">' + U.esc(t('your_mac_address')) + '<span>' + U.esc(mac) + '</span></div>' : '') +
                (c.code ? '<div class="gate-mac">' + U.esc(t('activation_code', 'Activation code')) + '<span>' + U.esc(c.code) + '</span></div>' : '') +
                '<div class="gate-btns">' + btns + '</div></div>';
            if (c.qr) {
                html += '<div class="gate-right"><div class="qr-frame"><img src="' + U.qrDataUrl(c.qr) + '" alt="" /></div>' +
                    '<div class="t-caption">' + U.esc(t('activation_scan', 'Scan with your phone')) + '</div>' +
                    '<div class="gate-url">' + U.esc(c.qr.replace(/^https?:\/\//, '').replace(/\?.*$/, '')) + '</div></div>';
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
                            Gate.stopCountdown();
                            if (act === 'start') { Gate.close(); if (opts.onStart) opts.onStart(); else App.choosePlaylist(); }
                            else if (act === 'retry') { Gate.close(); App.boot(); }
                            else if (act === 'network') App.SettingsPanel.network();
                            else if (act === 'exit') App.confirmExit();
                        }
                    })
                },
                zone: 'btns',
                // Bilo koja tipka prekida odbrojavanje (korisnik cita / skenira QR).
                onKey: function () { Gate.stopCountdown(); return false; },
                onBack: function () { App.confirmExit(); }
            };
            Nav.push(layer);
            if (c.countdown) Gate.startCountdown(8);
        },
        startCountdown: function (sec) {
            var b = U.byId('gate-start');
            if (!b) return;
            var label = b.innerHTML;
            var left = sec;
            var tick = function () {
                if (left <= 0) {
                    countdown = null;
                    b.innerHTML = label;
                    Gate.close();
                    App.choosePlaylist();
                    return;
                }
                b.innerHTML = label + ' · ' + left;
                left--;
                countdown = setTimeout(tick, 1000);
            };
            b._label = label;
            tick();
        },
        stopCountdown: function () {
            if (!countdown) return;
            clearTimeout(countdown);
            countdown = null;
            var b = U.byId('gate-start');
            if (b && b._label) b.innerHTML = b._label;
        },
        close: function () {
            Gate.stopCountdown();
            if (layer) { Nav.pop(layer); layer = null; }
            U.hide('gate');
        }
    };
})();
