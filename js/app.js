/* Pokretanje aplikacije i tok prijave. */
(function () {
    var A = App;

    A.mac = '';
    A.info = null;

    A.start = function () {
        A.Platform.init(function () {
            A.Player.init();
            // Zadnji poznati prijevodi (prije odgovora servera).
            A.I18N.setLanguages(U.store.get('lbbe_languages', []));
            A.applyLanguage();
            A.boot();
        });
    };

    /**
     * Portal (playlist_information): jedan tihi ponovni pokusaj (TV boxevi dobiju mrezu sekundu kasnije).
     * 403 pairing_required -> potvrda uredaja, NIKAD nastavak sa spremljenim podacima.
     * Portal ne radi, a uredaj je registriran i pretplata vrijedi -> nastavi sa spremljenim podacima portala.
     */
    A.boot = function () {
        A.Shell.stop();
        A.Loader.step('loading_connecting', 4);
        var p = A.mac ? Promise.resolve(A.mac) : A.Platform.getDeviceId();
        var fetchInfo = function () { return A.Api.playlistInformation(A.mac); };
        p.then(function (mac) {
            A.mac = mac;
            A.Loader.step('loading_connecting', 8);
            return fetchInfo().then(null, function (err) {
                if (A.Api.pairingFrom(err) || (err && (err.status === 401 || err.status === 403))) throw err;
                return new Promise(function (res) { setTimeout(res, 1500); }).then(fetchInfo);
            });
        }).then(function (info) {
            U.store.set('lbbe_info_cache', { info: info, t: U.now(), mac: A.mac });
            A.useInfo(info);
            A.route();
        }, function (err) {
            U.log('playlist_information failed', err);
            var pair = A.Api.pairingFrom(err);
            if (pair) { A.Gate.show('pairing', { code: pair.code }); return; }
            var cached = U.store.get('lbbe_info_cache', null);
            if (cached && cached.info && cached.mac === A.mac && A.canUseCachedInfo(cached.info) && !(err && (err.status === 401 || err.status === 403))) {
                A.useInfo(cached.info);
                A.toast(t('portal_offline', 'LBBE server is not responding \u2013 using saved data.'), 4000);
                A.choosePlaylist();
                return;
            }
            A.Gate.show('network', { detail: A.technical(err) });
        });
    };

    A.useInfo = function (info) {
        A.info = info;
        info.urls = U.toArray(info.urls).filter(function (u) { return typeof u === 'string' && u.trim() !== ''; })
            .map(function (u) { return u.trim(); });
        if (info.languages) {
            A.I18N.setLanguages(info.languages);
            U.store.set('lbbe_languages', info.languages);
            A.applyLanguage();
        }
    };
    A.canUseCachedInfo = function (info) {
        var urls = U.toArray(info.urls);
        var d = U.parseDate(info.expire_date);
        return !!(info.mac_registered && urls.length && d && d.getTime() + 86400000 > U.now());
    };

    A.applyLanguage = function () {
        var code = A.Settings.get('language');
        var langs = A.I18N.languages();
        if (!code) {
            var nav = (navigator.language || 'en').split('-')[0];
            code = 'en';
            for (var i = 0; i < langs.length; i++) if (langs[i].code === nav) code = nav;
            if (code === 'en' && langs.length && !langs.some(function (l) { return l.code === 'en'; })) code = langs[0].code;
        }
        A.I18N.setLang(code);
    };

    A.today = function () {
        var d = new Date();
        return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
    };
    A.isExpired = function () {
        var e = A.info && A.info.expire_date;
        return !!(e && String(e).substr(0, 10) < A.today());
    };

    A.daysLeft = function () {
        var d = A.info && U.parseDate(A.info.expire_date);
        return d ? Math.ceil((d.getTime() + 86400000 - U.now()) / 86400000) - 1 : null;
    };

    /** Kao Android showActivation: neregistriran / istekao / bez playliste / trial / istjece uskoro / aktivan. */
    A.route = function () {
        var info = A.info;
        if (!info.mac_registered) { A.Gate.show('activate', { canContinue: info.urls.length > 0 }); return; }
        if (A.isExpired()) { A.Gate.show('expired'); return; }
        if (!info.urls.length) { A.Gate.show('noplaylist'); return; }
        var dl = A.daysLeft();
        if (info.is_trial == 1) { A.Gate.show('trial'); return; }
        if (dl !== null && dl < 7) { A.Gate.show('expiring'); return; }
        A.choosePlaylist();
    };

    A.choosePlaylist = function () {
        var urls = A.info.urls;
        var idx = A.Settings.get('playlist_index');
        if (idx >= 0 && idx < urls.length) { A.loadPlaylist(idx); return; }
        if (urls.length === 1) { A.loadPlaylist(0); return; }
        A.pickPlaylist(false);
    };

    /** Odabir playliste (vise URL-ova). fromGate = poziv s ekrana greske. */
    A.pickPlaylist = function (fromGate) {
        var urls = A.info.urls;
        var cur = A.Settings.get('playlist_index');
        var opts = urls.map(function (u, i) { return { label: t('playlist') + ' ' + (i + 1), sub: A.playlistHost(u), value: i }; });
        A.Loader.hide();
        A.Dialog.choose(t('select_playlist'), opts, cur).then(function (v) {
            if (v === null) {
                if (!fromGate && !A.Shell.started) A.confirmExit(function () { A.pickPlaylist(fromGate); });
                return;
            }
            if (fromGate) A.Gate.close();
            A.loadPlaylist(v);
        });
    };

    A.playlistHost = function (url) {
        var m = String(url || '').match(/^https?:\/\/([^\/?#]+)/i);
        return m ? m[1] : String(url || '').substr(0, 40);
    };

    A.loadPlaylist = function (idx) {
        var url = A.info.urls[idx];
        if (!url) { A.Gate.show('noplaylist'); return; }
        A.Settings.set('playlist_index', idx);
        A.Shell.stop();
        A.Gate.close();
        var token = A.loadToken = (A.loadToken || 0) + 1;
        A.Loader.step('loading_connecting', 2);
        A.Loader.armSlow(function () {
            // "Taking too long? Options": prekini cekanje i ponudi iste akcije kao kod greske.
            A.Lib.cancel();
            A.loadToken++;
            A.loadError({ stalled: true }, idx);
        });
        A.Lib.load(url, function (key, pct, step, total, detail) {
            if (token === A.loadToken) A.Loader.step(key, pct, step, total, detail);
        }).then(function () {
            if (token !== A.loadToken) return;
            A.started(false);
        }, function (err) {
            if (token !== A.loadToken || (err && err.cancelled)) return;
            U.log('playlist load failed', err);
            A.loadError(err, idx);
        });
    };

    A.started = function (fromCache) {
        A.Loader.step('loading_starting', 100);
        setTimeout(function () {
            A.Loader.hide();
            A.Shell.start();
            if (fromCache) A.toast(t('saved_data_used', 'Using saved data from') + ' ' + U.fmtDate(new Date(A.Lib.cacheTime || U.now())), 3500);
        }, 50);
    };

    /** Ekran greske ucitavanja + akcije oporavka (Android LoadingScreen.Actions / RecoveryMenu). */
    A.loadError = function (err, idx) {
        var e = A.classify(err);
        var url = A.info.urls[idx];
        A.Lib.hasCache(url).then(function (has) {
            var actions = [{ id: 'retry', label: t('retry'), icon: 'reload' }];
            if (has) actions.push({ id: 'saved', label: t('action_continue_offline', 'Continue with saved data'), icon: 'playlists' });
            actions.push({ id: 'clear', label: t('action_clear_cache', 'Clear cache & retry'), icon: 'clearCache' });
            if (A.info.urls.length > 1) actions.push({ id: 'playlist', label: t('change_playlist'), icon: 'list' });
            actions.push({ id: 'more', label: t('action_more', 'More'), icon: 'more' });
            A.Loader.error(e, actions, function (act) {
                if (act === 'retry') A.loadPlaylist(idx);
                else if (act === 'saved') {
                    A.Loader.step('loading_starting', 90);
                    A.Lib.loadCache(url).then(function (ok) { if (ok) A.started(true); else A.loadPlaylist(idx); });
                } else if (act === 'clear') A.clearCache(false).then(function () { A.loadPlaylist(idx); });
                else if (act === 'playlist') A.pickPlaylist(true);
                else if (act === 'more') A.moreOptions(idx);
            });
        });
    };

    /** More: Network test, Manage playlists (QR), Reload device info, Clear all data & retry. */
    A.moreOptions = function (idx) {
        A.Dialog.options(t('more_title', 'More options'), [
            { value: 'network', icon: 'network', label: t('network_test'), desc: t('more_network_test_desc', 'Ping, download and upload speed') },
            { value: 'playlists', icon: 'qr', label: t('more_manage_playlists', 'Manage playlists (QR)'), desc: t('more_manage_playlists_desc', 'Add or fix playlists from your phone') },
            { value: 'portal', icon: 'reload', label: t('more_reload_portal', 'Reload device info'), desc: t('more_reload_portal_desc', 'Load device and playlist info again') },
            { value: 'all', icon: 'delete', label: t('more_clear_all', 'Clear all data & retry'), desc: t('more_clear_all_desc', 'Delete channels, movies, series and favourites, then reload'), danger: true }
        ]).then(function (v) {
            if (v === 'network') A.SettingsPanel.network();
            else if (v === 'playlists') A.SettingsPanel.addPlaylist();
            else if (v === 'portal') A.boot();
            else if (v === 'all') A.confirmClearAll();
        });
    };

    /** all=false: samo cache (favoriti ostaju); all=true: i favoriti, povijest, nastavak (postavke i ID uredaja ostaju). */
    A.clearCache = function (all) {
        if (A.Live && A.Live.clearEpg) A.Live.clearEpg();
        U.store.remove('lbbe_info_cache');
        if (all) {
            var keep = { lbbe_settings: 1, lbbe_device_key: 1, lbbe_device_id: 1, lbbe_device_token: 1, lbbe_languages: 1 };
            try {
                for (var i = window.localStorage.length - 1; i >= 0; i--) {
                    var k = window.localStorage.key(i);
                    if (k && !keep[k]) window.localStorage.removeItem(k);
                }
            } catch (e) { }
            U.store.cache = {};
        }
        return A.Cache.clear();
    };
    A.confirmClearAll = function () {
        A.Dialog.confirm(t('clear_cache_option_all', 'Clear all data'),
            t('clear_all_confirm', 'Delete all channels, movies, series, favourites and watch history? The playlist will be loaded again. Settings and your MAC address stay.'),
            t('clear_all_action', 'Delete and reload'), t('cancel'), true).then(function (yes) {
                if (!yes) return;
                A.clearCache(true).then(function () { A.toast(t('loading_data_reset', 'Data reset. Reloading\u2026')); A.boot(); });
            });
    };

    /** Greska -> {tone, icon, title, msg, detail} (Android LoadingErrors). */
    A.classify = function (err) {
        var d = A.technical(err);
        var e = function (tone, icon, title, msg, detail) { return { tone: tone, icon: icon, title: title, msg: msg, detail: detail === undefined ? d : detail }; };
        err = err || {};
        if (err.stalled) return e('warn', 'hourglass', t('error_stalled_title', 'Loading is taking too long'), t('error_stalled_msg', 'The server is very slow or not answering. Try again, clear the cache or continue with saved data.'), '');
        if (navigator.onLine === false) return e('warn', 'wifiOff', t('error_no_internet_title', 'No internet connection'), t('no_internet', 'Your device is offline. Check Wi-Fi or the network cable, then try again.'), '');
        if (err.auth || err.status === 401) return e('danger', 'lock', t('error_auth_title', 'Playlist login failed'), t('error_auth_msg', 'The username or password of this playlist is not correct. Check the playlist details with your IPTV provider.'));
        if (err.expired) return e('danger', 'hourglass', t('error_expired_title', 'Playlist subscription expired'), t('error_playlist_account_expired', 'The playlist account has expired. Contact your IPTV provider.'));
        if (err.status === 403) return e('danger', 'lock', t('error_access_denied_title', 'Access denied'), t('error_server_access_denied'));
        if (err.empty) return e('info', 'list', t('error_empty_title', 'Playlist is empty'), t('error_empty_msg', 'The playlist was downloaded but contains no channels, movies or series. It may not be a valid M3U file.'));
        if (err.status === 404) return e('danger', 'alert', t('error_not_found_title', 'Playlist not found'), t('error_playlist_not_found'));
        if (err.parse) return e('danger', 'alert', t('error_bad_response', 'Unexpected server response'), t('error_generic_msg', 'An unexpected error occurred. Please try again.'));
        if (err.timeout) return e('warn', 'cloudOff', t('error_timeout_title', 'Server is not responding'), t('error_timeout_msg', 'The server took too long to answer. It may be overloaded or blocked on your network. Try again later.'));
        if (err.status >= 500) return e('warn', 'cloudOff', t('error_server_title', 'Server error'), t('error_server_msg', 'The server has a problem right now. Try again later or contact your provider.'));
        if (err.m3u) return e('warn', 'cloudOff', t('error_m3u_title', 'Playlist download failed'), t('error_m3u_msg', 'The M3U playlist could not be downloaded. Check the link or try again.'));
        if (err.status === 0) return e('warn', 'cloudOff', t('error_connect_title', 'Can\'t connect to the server'), t('error_connect_msg', 'The server refused the connection or is offline. Try again in a few minutes.'));
        return e('danger', 'alert', t('error_generic_title', 'Something went wrong'), t('error_generic_msg', 'An unexpected error occurred. Please try again.'));
    };
    /** Tehnicki detalj (HTTP kod, timeout). */
    A.technical = function (err) {
        if (!err) return '';
        if (err.timeout) return 'Timeout';
        if (err.status) return 'HTTP ' + err.status;
        if (err.parse) return t('error_bad_response', 'Unexpected server response');
        return '';
    };

    /** Stari naziv (koriste ga ekrani). */
    A.errorText = function (err) { var e = A.classify(err); return e.msg; };

    A.confirmExit = function (onNo) {
        A.Dialog.confirm(t('exit'), t('exit_app'), t('yes'), t('no'), true).then(function (yes) {
            if (yes) A.Platform.exit();
            else if (onNo) onNo();
        });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(A.start, 0);
    else document.addEventListener('DOMContentLoaded', A.start);
})();
