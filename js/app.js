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

    A.boot = function () {
        A.Splash.show('connecting', 5);
        var p = A.mac ? Promise.resolve(A.mac) : A.Platform.getDeviceId();
        p.then(function (mac) {
            A.mac = mac;
            A.Splash.show('connecting', 12);
            return A.Api.playlistInformation(mac);
        }).then(function (info) {
            A.info = info;
            info.urls = U.toArray(info.urls).filter(function (u) { return typeof u === 'string' && u.trim() !== ''; })
                .map(function (u) { return u.trim(); });
            if (info.languages) {
                A.I18N.setLanguages(info.languages);
                U.store.set('lbbe_languages', info.languages);
                A.applyLanguage();
            }
            A.route();
        }, function (err) {
            U.log('playlist_information failed', err);
            A.Gate.show('network', { detail: A.errorText(err) });
        });
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

    A.route = function () {
        var info = A.info;
        if (A.isExpired() && info.mac_registered) { A.Gate.show('expired'); return; }
        if (!info.mac_registered) { A.Gate.show('activate', { canContinue: info.urls.length > 0 }); return; }
        if (!info.urls.length) { A.Gate.show('noplaylist'); return; }
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
        A.Splash.hide();
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
        A.Settings.set('playlist_index', idx);
        A.Shell.stop();
        A.Splash.show('connecting', 5);
        A.Lib.load(url, function (key, pct) { A.Splash.show(key, pct); }).then(function () {
            A.Splash.show('preparing', 100);
            setTimeout(function () {
                A.Splash.hide();
                A.Shell.start();
            }, 50);
        }, function (err) {
            U.log('playlist load failed', err);
            A.Gate.show('error', { message: A.errorText(err), detail: A.playlistHost(url) });
        });
    };

    /** Poruka greske kao na Androidu (errorPlaylistNotFound, errorServerAccessDenied ...). */
    A.errorText = function (err) {
        if (!err) return t('error_generic');
        if (err.empty) return t('error_invalid_playlist');
        if (err.expired) return t('error_playlist_account_expired', 'The playlist account has expired.');
        if (err.parse) return t('error_parsing_response_data');
        if (err.status === 404) return t('error_playlist_not_found');
        if (err.status === 401 || err.status === 403) return t('error_server_access_denied');
        if (err.timeout) return t('error_network') + ' (timeout)';
        if (err.status === 0) return t('error_network');
        if (err.status) return t('error_generic') + ' (HTTP ' + err.status + ')';
        return t('error_generic');
    };

    A.confirmExit = function (onNo) {
        A.Dialog.confirm(t('exit'), t('exit_app'), t('yes'), t('no'), true).then(function (yes) {
            if (yes) A.Platform.exit();
            else if (onNo) onNo();
        });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(A.start, 0);
    else document.addEventListener('DOMContentLoaded', A.start);
})();
