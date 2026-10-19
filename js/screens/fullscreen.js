/*
 * Puni ekran: Live (OSD s EPG-om), catch-up (timeshift) i VOD (filmovi / epizode).
 * Tipke prema APP.md §3 "Timeshift / catch-up / VOD u punom ekranu".
 */
(function () {
    var layer = null;
    var hideTimer = null, clockTimer = null, progTimer = null, seekTimer = null, hintTimer = null;
    var pendingSeek = 0;
    var unsub = null;
    var keyRepeat = { key: '', count: 0, last: 0 };

    var F = App.Fullscreen = {
        mode: '',          // 'live' | 'catchup' | 'vod'
        osdVisible: false,
        epg: [],
        catchup: null,     // {ch, prog, offsetMin, totalMin}
        vod: null,         // media iz Info ekrana

        /* ---------------- otvaranje ---------------- */
        openLive: function () {
            F.mode = 'live';
            F.open();
            F.renderLive();
            F.showOsd(false);
        },
        openCatchup: function (ch, prog) {
            var totalMin = U.clamp(Math.round((prog.end - prog.start) / 60000), 1, 360);
            F.catchup = { ch: ch, prog: prog, offsetMin: 0, totalMin: totalMin };
            F.mode = 'catchup';
            F.open();
            F.playCatchupAt(0);
            F.renderSeek();
            F.showOsd(false);
        },
        /** media: {kind 'vod'|'episode', item, url, title, subtitle, start, resumeKey, next()} */
        openVod: function (media) {
            F.vod = media;
            if (media.onPlay) media.onPlay();
            F.mode = 'vod';
            F.open();
            App.Player.play(media);
            F.renderSeek();
            F.showOsd(false);
        },

        open: function () {
            if (!layer) {
                layer = {
                    name: 'fs',
                    zones: {
                        surface: { key: function () { return false; }, focus: function () { }, blur: function () { }, nb: {} }
                    },
                    zone: 'surface',
                    onKey: F.onKey,
                    onBack: F.onBack
                };
                Nav.push(layer);
            }
            U.show('fs');
            App.rootClass('fullscreen-video', true);
            App.Player.setFull();
            if (!unsub) unsub = App.Player.on(F.onPlayer);
            clearInterval(clockTimer);
            clockTimer = setInterval(F.tick, 1000);
        },
        close: function () {
            clearTimeout(hideTimer); clearInterval(clockTimer); clearTimeout(seekTimer); clearTimeout(hintTimer);
            pendingSeek = 0;
            if (unsub) { unsub(); unsub = null; }
            if (layer) { var l = layer; layer = null; Nav.pop(l); }
            U.hide('fs');
            U.byId('fs').innerHTML = '';
            App.rootClass('fullscreen-video', false);
            F.osdVisible = false;
        },

        /* ---------------- Live ---------------- */
        renderLive: function () {
            var ch = App.Live.playingChannel();
            if (!ch) return;
            var fav = App.Lib.isFav('live', ch.id);
            U.byId('fs').innerHTML =
                '<div id="osd" class="hidden"><div class="osd-top"><div class="osd-logo">' + (U.safeUrl(ch.icon) ? '<img src="' + U.safeUrl(ch.icon) + '" alt="" onerror="this.style.display=\'none\'" />' : '') + '</div>' +
                '<div class="osd-ch"><span class="live">' + U.esc(t('live')) + '</span><span class="nm">' + U.esc((ch.num ? ch.num + '  ' : '') + ch.name) +
                (fav ? App.icon('star') : '') + '</span><div class="cat">' + U.esc(App.Lib.categoryName('live', ch.cat)) + '</div></div>' +
                '<div class="osd-clock" id="osd-clock"></div></div>' +
                '<div class="osd-bottom"><div class="osd-now" id="osd-now"></div><div class="osd-desc" id="osd-desc"></div>' +
                '<div class="osd-prog"><span class="tm" id="osd-start"></span><div class="bar"><div id="osd-bar" style="width:0"></div></div><span class="tm r" id="osd-end"></span></div>' +
                '<div class="osd-next" id="osd-next"></div></div></div>' +
                F.commonHtml();
            F.tick();
            F.epg = [];
            App.Live.epgFor(ch, function (list) {
                if (App.Live.playingId !== ch.id || F.mode !== 'live') return;
                F.epg = list;
                F.paintLiveEpg();
            });
            F.paintLiveEpg();
            F.paintState();
        },
        paintLiveEpg: function () {
            var now = U.now();
            var cur = null, next = null;
            for (var i = 0; i < F.epg.length; i++) {
                var p = F.epg[i];
                if (p.start <= now && p.end > now) { cur = p; next = F.epg[i + 1] || null; break; }
                if (p.start > now && !next) next = p;
            }
            var nowEl = U.byId('osd-now');
            if (!nowEl) return;
            if (cur) {
                nowEl.innerHTML = U.esc(cur.title) + '<span class="tm">' + U.esc(U.fmtClock(cur.start) + ' – ' + U.fmtClock(cur.end)) + '</span>';
                U.byId('osd-desc').textContent = cur.desc || '';
                U.byId('osd-start').textContent = U.fmtClock(cur.start);
                U.byId('osd-end').textContent = U.fmtClock(cur.end);
                U.byId('osd-bar').style.width = U.clamp(100 * (now - cur.start) / (cur.end - cur.start), 0, 100) + '%';
            } else {
                nowEl.textContent = t('no_epg_data');
                U.byId('osd-desc').textContent = '';
                U.byId('osd-start').textContent = '';
                U.byId('osd-end').textContent = '';
            }
            U.byId('osd-next').innerHTML = next ? '<b>' + U.esc(t('up_next').toUpperCase()) + '</b>' + U.esc(U.fmtClock(next.start) + '  ' + next.title) : '';
        },

        /* ---------------- catch-up / VOD (premotavanje) ---------------- */
        renderSeek: function () {
            if (F.mode === 'vod') { F.renderVod(); return; }
            var c = F.catchup;
            var title = c.prog.title || c.ch.name;
            var sub = c.ch.name + '  ·  ' + U.fmtDayName(new Date(c.prog.start)) + ' ' + U.fmtClock(c.prog.start) + ' – ' + U.fmtClock(c.prog.end);
            var bs = F.bigStep(), ss = F.smallStep();
            U.byId('fs').innerHTML =
                '<div id="osd" class="hidden"><div class="osd-top"><div class="osd-ch" style="margin-left:0"><span class="live catchup">' + U.esc(t('archive')) + '</span>' +
                '<span class="nm">' + U.esc(title) + '</span><div class="cat">' + U.esc(sub) + '</div></div>' +
                '<div class="osd-clock" id="osd-clock"></div></div>' +
                '<div class="osd-bottom">' +
                '<div class="osd-prog"><span class="tm" id="osd-start"></span><div class="bar"><div id="osd-bar" style="width:0"></div></div><span class="tm r" id="osd-end"></span></div>' +
                '<div class="osd-ctrls" id="osd-ctrls">' +
                '<div class="osd-btn f" data-act="bb">' + App.icon('rewind') + ' ' + U.esc(F.fmtStep(bs)) + '</div>' +
                '<div class="osd-btn f" data-act="b">−' + U.esc(F.fmtStep(ss)) + '</div>' +
                '<div class="osd-btn play f" data-act="pp" id="osd-pp">' + App.icon('pause') + '</div>' +
                '<div class="osd-btn f" data-act="f">+' + U.esc(F.fmtStep(ss)) + '</div>' +
                '<div class="osd-btn f" data-act="ff">' + U.esc(F.fmtStep(bs)) + ' ' + App.icon('fastForward') + '</div>' +
                '<span style="display:inline-block;width:60px"></span>' +
                '<div class="osd-btn small f" data-act="audio">' + App.icon('audio') + '</div>' +
                '<div class="osd-btn small f" data-act="subs">' + App.icon('subtitles') + '</div>' +
                '<div class="osd-btn small f" data-act="ratio">' + App.icon('ratio') + '</div>' +
                '</div></div></div>' + F.commonHtml();
            layer.zones.ctrls = new W.Group({
                el: U.byId('osd-ctrls'), name: 'ctrls', index: 2,
                onOk: function (el) { F.ctrl(el.getAttribute('data-act')); },
                onFocus: function () { F.showOsd(false); },
                nb: { up: 'surface', down: 'surface' }
            });
            delete layer.zones.eps;
            F.ppIndex = 2;
            F.tick();
            F.paintState();
        },
        /**
         * VOD OSD (Android 2.2.6): gore naslov + podnaslov + sat; traka napretka (fokusabilna, lijevo/desno
         * ±1 %) s proteklim i preostalim vremenom; lijevo audio/titlovi, sredina prethodna / −30 s / play /
         * +30 s / sljedeca, desno omjer + info (film) ili red epizoda (serija).
         */
        renderVod: function () {
            var m = F.vod;
            var series = m.kind === 'episode' && m.episodes && m.episodes.length > 1;
            var hasPrev = !!(m.prev && m.prev()), hasNext = !!(m.next && m.next());
            var epsHtml = '';
            if (series) {
                epsHtml = '<div class="osd-eps hidden" id="osd-eps"><div class="osd-eps-h">' + U.esc(t('season') + ' ' + m.seasonNum) + '</div><div class="osd-eps-row" id="osd-eps-row"></div></div>';
            }
            U.byId('fs').innerHTML =
                '<div id="osd" class="hidden vod"><div class="osd-top"><div class="osd-ch" style="margin-left:0">' +
                '<span class="nm">' + U.esc(m.title) + '</span><div class="cat">' + U.esc(m.subtitle || '') + '</div></div>' +
                '<div class="osd-clock" id="osd-clock"></div></div>' +
                '<div class="osd-bottom" id="osd-panel">' + epsHtml +
                '<div class="osd-prog"><span class="tm" id="osd-start"></span><div class="bar seek f" data-act="bar"><div id="osd-bar" style="width:0"></div><i id="osd-knob"></i></div><span class="tm r" id="osd-end"></span></div>' +
                '<div class="osd-row">' +
                '<div class="osd-l">' +
                '<div class="osd-btn small f" data-act="audio">' + App.icon('audio') + '</div>' +
                '<div class="osd-btn small f" data-act="subs">' + App.icon('subtitles') + '</div></div>' +
                '<div class="osd-c">' +
                (hasPrev ? '<div class="osd-btn f" data-act="prev">' + App.icon('next', 'flip') + '</div>' : '') +
                '<div class="osd-btn f" data-act="b">' + App.icon('replay30') + '</div>' +
                '<div class="osd-btn play f" data-act="pp" id="osd-pp">' + App.icon('pause') + '</div>' +
                '<div class="osd-btn f" data-act="f">' + App.icon('forward30') + '</div>' +
                (hasNext ? '<div class="osd-btn f" data-act="next">' + App.icon('next') + '</div>' : '') + '</div>' +
                '<div class="osd-r">' +
                '<div class="osd-btn small f" data-act="ratio">' + App.icon('ratio') + '</div>' +
                (series ? '<div class="osd-btn small f" data-act="eps">' + App.icon('series') + ' ' + U.esc(t('osd_episodes', 'Episodes')) + '</div>'
                    : (m.about ? '<div class="osd-btn small f" data-act="about">' + App.icon('info') + '</div>' : '')) +
                '</div></div></div></div>' + F.commonHtml();
            var ctrls = layer.zones.ctrls = new W.Group({
                el: U.byId('osd-panel'), name: 'ctrls',
                onOk: function (el) { F.ctrl(el.getAttribute('data-act')); },
                onFocus: function () { F.showOsd(false); },
                keys: function (a, el) {
                    if (el && el.getAttribute('data-act') === 'bar' && (a === 'left' || a === 'right')) {
                        var dur = App.Player.duration();
                        F.seekBy((a === 'right' ? 1 : -1) * (dur > 0 ? Math.max(5, Math.round(dur / 100)) : 30));
                        return true;
                    }
                    return false;
                },
                nb: { up: function () { return F.epsOpen ? 'eps' : 'surface'; }, down: 'surface' }
            });
            for (var i = 0; i < ctrls.items.length; i++) if (ctrls.items[i].id === 'osd-pp') F.ppIndex = i;
            ctrls.index = F.ppIndex;
            F.epsOpen = false;
            delete layer.zones.eps;
            if (series) {
                layer.zones.eps = new W.HRow({
                    el: U.byId('osd-eps-row'), name: 'eps', items: m.episodes, cardCls: 'osd-ep',
                    inner: function (e, i) {
                        var r = App.Lib.getResume('series', 'ep' + e.id);
                        return '<div class="ep-img">' + App.img(e.image, 'series') + '<span class="ep-n">' + U.esc(t('episode_short') + e.num) + '</span>' +
                            (i === m.epIndex ? '<span class="ep-now">' + U.esc(t('now_playing', 'Now playing')) + '</span>' : '') +
                            (r && r.d ? '<div class="eprog"><div style="width:' + Math.round(100 * r.p / r.d) + '%"></div></div>' : '') + '</div>' +
                            '<div class="ep-t">' + U.esc(e.title) + '</div>';
                    },
                    onOk: function (i) { F.playEpisodeAt(i); },
                    onFocus: function () { F.showOsd(false); },
                    nb: { down: 'ctrls', up: 'surface' }
                });
            }
            F.tick();
            F.paintState();
        },
        toggleEpisodes: function (open) {
            var el = U.byId('osd-eps');
            if (!el || !layer.zones.eps) return;
            F.epsOpen = open === undefined ? !F.epsOpen : open;
            U.toggle(el, 'hidden', !F.epsOpen);
            if (F.epsOpen) {
                layer.zones.eps.index = F.vod.epIndex || 0;
                Nav.focus('eps');
                F.showOsd(false, true);
            } else {
                Nav.focus('ctrls');
                F.showOsd(false);
            }
        },
        playEpisodeAt: function (i) {
            if (!F.vod || i === F.vod.epIndex) { F.toggleEpisodes(false); return; }
            var nx = F.vod.at ? F.vod.at(i) : null;
            if (nx) F.playMedia(nx);
        },
        showAbout: function () {
            var m = F.vod, a = m && m.about;
            if (!a) return;
            var body = (a.facts ? '<div class="t-caption" style="margin-bottom:16px">' + U.esc(a.facts) + '</div>' : '') +
                (a.plot ? '<div class="about-plot">' + U.esc(a.plot) + '</div>' : '') +
                (a.director ? '<div class="t-caption" style="margin-top:14px"><b>' + U.esc(t('director')) + ':</b> ' + U.esc(a.director) + '</div>' : '') +
                (a.cast ? '<div class="t-caption"><b>' + U.esc(t('cast')) + ':</b> ' + U.esc(a.cast) + '</div>' : '');
            App.Dialog.open({
                title: m.title, body: body, width: 1100,
                buttons: [{ label: t('close', 'Close'), act: 'close', primary: true }],
                onButton: function (act, dlg) { dlg.close(); }
            });
        },
        commonHtml: function () {
            return '<div class="sub-text" id="sub-text"></div><div id="fs-state"></div><div id="fs-hint"></div><div id="fs-zap"></div>';
        },
        isSeekable: function () { return App.Player.duration() > 0; },
        smallStep: function () { return F.isSeekable() || F.mode === 'vod' ? 30 : 60; },
        bigStep: function () { return F.isSeekable() || F.mode === 'vod' ? 300 : 600; },
        fmtStep: function (s) { return s >= 60 ? (s / 60) + ' min' : s + ' s'; },

        ctrl: function (act) {
            if (act === 'bb') F.seekBy(-F.bigStep());
            else if (act === 'b') F.seekBy(-F.smallStep());
            else if (act === 'f') F.seekBy(F.smallStep());
            else if (act === 'ff') F.seekBy(F.bigStep());
            else if (act === 'pp') F.togglePause();
            else if (act === 'audio') F.chooseTrack('audio');
            else if (act === 'subs') F.chooseTrack('text');
            else if (act === 'ratio') F.chooseRatio();
            else if (act === 'next') F.playNext();
            else if (act === 'prev') F.playPrev();
            else if (act === 'eps') F.toggleEpisodes();
            else if (act === 'about') F.showAbout();
            else if (act === 'bar') F.togglePause();
        },
        togglePause: function () {
            App.Player.toggle();
            F.paintState();
            F.showOsd(false);
        },
        /** Uzastopni pritisci se zbrajaju i primjenjuju jednom. */
        seekBy: function (sec) {
            pendingSeek += sec;
            var a = Math.abs(pendingSeek);
            F.hint((pendingSeek < 0 ? '−' : '+') + Math.floor(a / 60) + ':' + U.pad2(a % 60));
            F.showOsd(false);
            clearTimeout(seekTimer);
            seekTimer = setTimeout(function () {
                var d = pendingSeek;
                pendingSeek = 0;
                F.applySeek(d);
            }, F.isSeekable() ? 350 : 800);
        },
        applySeek: function (d) {
            if (!d) return;
            var P = App.Player;
            var dur = P.duration();
            if (dur > 0) {
                P.seek(U.clamp(P.time() + d, 0, Math.max(0, dur - 2)));
            } else if (F.mode === 'catchup') {
                var c = F.catchup;
                var curMin = c.offsetMin + P.time() / 60;
                var nm = Math.round(U.clamp(curMin + d / 60, 0, Math.max(0, c.totalMin - 1)));
                if (nm === c.offsetMin && Math.abs(d) < 60) return;
                F.playCatchupAt(nm);
            }
            F.updateProgress();
        },
        /** timeshift.php ne zna trajanje: skok = ponovno otvaranje arhive s novim pocetkom (minute). */
        playCatchupAt: function (offsetMin) {
            var c = F.catchup;
            c.offsetMin = offsetMin;
            var startMs = c.prog.serverStart + offsetMin * 60000;
            var url = App.Xtream.timeshiftUrl(c.ch.id, startMs, Math.max(1, c.totalMin - offsetMin));
            App.Player.play({ kind: 'catchup', item: c.ch, url: url, title: c.prog.title });
        },
        hint: function (text) {
            var el = U.byId('fs-hint');
            if (!el) return;
            el.innerHTML = text ? '<div class="seek-hint">' + U.esc(text) + '</div>' : '';
            clearTimeout(hintTimer);
            hintTimer = setTimeout(function () { var e = U.byId('fs-hint'); if (e) e.innerHTML = ''; }, 1300);
        },
        showZap: function (digits) {
            var el = U.byId('fs-zap');
            if (el) el.innerHTML = digits ? '<div class="zap-num">' + U.esc(digits) + '</div>' : '';
        },
        updateProgress: function () {
            var bar = U.byId('osd-bar');
            if (!bar || F.mode === 'live') return;
            var P = App.Player, pos, total;
            if (F.mode === 'catchup') {
                total = F.catchup.totalMin * 60;
                var dur = P.duration();
                pos = dur > 0 ? P.time() : F.catchup.offsetMin * 60 + P.time();
                if (dur > 0) total = dur;
                U.byId('osd-start').textContent = U.fmtClock(F.catchup.prog.start + pos * 1000);
                U.byId('osd-end').textContent = U.fmtClock(F.catchup.prog.end);
            } else {
                total = P.duration();
                pos = P.time();
                U.byId('osd-start').textContent = U.fmtDur(pos);
                U.byId('osd-end').textContent = total ? '−' + U.fmtDur(Math.max(0, total - pos)) : '';
            }
            var pct = total ? U.clamp(100 * pos / total, 0, 100) : 0;
            bar.style.width = pct + '%';
            var knob = U.byId('osd-knob');
            if (knob) knob.style.left = pct + '%';
        },
        paintState: function () {
            var P = App.Player;
            var el = U.byId('fs-state');
            if (!el) return;
            if (P.state === 'loading') el.innerHTML = '<div class="spinner center"></div>';
            else if (P.state === 'reconnecting') el.innerHTML = '<div class="fs-msg reconnect"><div class="spinner"></div><div>' + U.esc(P.reconnectText()) + '</div></div>';
            else if (P.state === 'error') el.innerHTML = '<div class="fs-msg">' + App.icon('alert') + '<div>' + U.esc(t('stream_error')) + '</div><div class="t-caption">' + U.esc(t('stream_retry')) + '</div></div>';
            else el.innerHTML = '';
            var pp = U.byId('osd-pp');
            if (pp) pp.innerHTML = App.icon(P.state === 'paused' ? 'play' : 'pause');
            if (P.state === 'paused') F.showOsd(false, true);
        },
        tick: function () {
            var c = U.byId('osd-clock');
            if (c) c.textContent = U.fmtClock(new Date());
            if (F.osdVisible) {
                if (F.mode === 'live') F.paintLiveEpg(); else F.updateProgress();
            }
        },

        /* ---------------- OSD ---------------- */
        showOsd: function (focusCtrls, sticky) {
            var o = U.byId('osd');
            if (!o) return;
            U.show(o);
            F.osdVisible = true;
            F.tick();
            if (focusCtrls && layer.zones.ctrls) { layer.zones.ctrls.index = F.ppIndex || 0; Nav.focus('ctrls'); }
            clearTimeout(hideTimer);
            if (!sticky) hideTimer = setTimeout(function () {
                if (App.Player.state === 'paused') return;
                F.hideOsd();
            }, 5000);
        },
        hideOsd: function () {
            if (F.epsOpen) { F.epsOpen = false; var ep = U.byId('osd-eps'); if (ep) U.hide(ep); }
            var o = U.byId('osd');
            if (o) U.hide(o);
            F.osdVisible = false;
            if (layer && layer.zone !== 'surface') Nav.focus('surface');
        },

        /* ---------------- tipke ---------------- */
        onKey: function (a, e) {
            var P = App.Player;
            if (P.state === 'error' && a === 'ok') { P.reopen(); return true; }
            if (F.mode === 'live') return F.liveKey(a);
            return F.seekKey(a, e);
        },
        liveKey: function (a) {
            if (a === 'up' || a === 'chup') { F.zap(1); return true; }
            if (a === 'down' || a === 'chdown') { F.zap(-1); return true; }
            if (a === 'ok') { F.exitLive(); return true; }
            if (a === 'left' || a === 'right' || a === 'info') { if (F.osdVisible && a === 'info') F.hideOsd(); else F.showOsd(false); return true; }
            if (/^[0-9]$/.test(a)) { App.Live.digit(a, true); return true; }
            if (a === 'yellow') {
                var ch = App.Live.playingChannel();
                if (ch) { App.Live.toggleFav(ch); F.renderLive(); F.showOsd(false); }
                return true;
            }
            if (a === 'red' || a === 'menu' || a === 'green') { F.liveOptions(); return true; }
            if (a === 'playpause' || a === 'pause' || a === 'play' || a === 'stop') return true;
            return false;
        },
        zap: function (dir) {
            // GORE = sljedeci kanal u listi (kao CH+).
            var ch = App.Live.zap(dir);
            if (!ch) return;
            F.renderLive();
            F.showOsd(false);
        },
        seekKey: function (a, e) {
            var ctrlsFocused = layer.zone !== 'surface' && F.osdVisible;
            if (a === 'left' || a === 'right') {
                if (ctrlsFocused) { F.showOsd(false); return false; }
                var now = U.now();
                if (keyRepeat.key === a && now - keyRepeat.last < 400) keyRepeat.count++; else keyRepeat.count = 0;
                keyRepeat.key = a; keyRepeat.last = now;
                var accel = keyRepeat.count > 20 ? 5 : (keyRepeat.count > 8 ? 2 : 1);
                F.seekBy((a === 'right' ? 1 : -1) * F.smallStep() * accel);
                return true;
            }
            if (a === 'ff') { F.seekBy(F.bigStep()); return true; }
            if (a === 'rw') { F.seekBy(-F.bigStep()); return true; }
            if (a === 'playpause' || a === 'play' || a === 'pause') {
                if (a === 'play' && App.Player.state === 'playing') return true;
                if (a === 'pause' && App.Player.state === 'paused') return true;
                F.togglePause();
                return true;
            }
            if (a === 'stop') { F.onBack(true); return true; }
            if (a === 'ok' || a === 'up' || a === 'down') {
                if (ctrlsFocused) { F.showOsd(false); return false; }
                F.showOsd(true);
                return true;
            }
            if (a === 'red' || a === 'menu') { F.chooseRatio(); return true; }
            if (a === 'info') { if (F.osdVisible) F.hideOsd(); else F.showOsd(false); return true; }
            if (ctrlsFocused) F.showOsd(false);
            return false;
        },
        onBack: function (force) {
            if (F.epsOpen && force !== true) { F.toggleEpisodes(false); return; }
            if (F.osdVisible && force !== true) { F.hideOsd(); return; }
            if (F.mode === 'live') { F.exitLive(); return; }
            if (F.mode === 'catchup') {
                F.close();
                // Natrag na listu emisija; pregled nastavlja live kanal.
                var ch = App.Live.playingChannel() || F.catchup.ch;
                App.Live.play(ch);
                App.Live.placePreview();
                return;
            }
            F.closeVod();
        },
        exitLive: function () {
            F.close();
            App.Live.placePreview();
            App.Live.paintStatus();
        },
        closeVod: function () {
            App.Player.stop();
            F.close();
            if (App.Info.visible()) App.Info.refresh();
        },
        playNext: function () {
            var nx = F.vod && F.vod.next ? F.vod.next() : null;
            if (nx) F.playMedia(nx);
        },
        playPrev: function () {
            var pv = F.vod && F.vod.prev ? F.vod.prev() : null;
            if (pv) F.playMedia(pv);
        },
        /** Druga epizoda iz OSD-a: nastavlja od zapamcene pozicije (ako postoji). */
        playMedia: function (media) {
            App.Player.saveResume();
            if (media.resumeKey && !media.start) {
                var r = App.Lib.getResume(media.resumeKey.kind, media.resumeKey.id);
                if (r && r.p) media.start = r.p;
            }
            F.vod = media;
            if (media.onPlay) media.onPlay();
            App.Player.play(media);
            F.renderSeek();
            F.showOsd(false);
        },
        onPlayer: function (ev) {
            if (ev === 'reconnect') F.paintState();
            if (ev === 'state') {
                F.paintState();
                if (App.Player.state === 'ended') {
                    if (F.mode === 'vod' && F.vod.next && F.vod.next()) F.playNext();
                    else if (F.mode === 'vod') F.closeVod();
                    else if (F.mode === 'catchup') F.onBack(true);
                }
            }
            if (ev === 'time' && F.osdVisible && F.mode !== 'live') F.updateProgress();
        },

        /* ---------------- dijalozi ---------------- */
        liveOptions: function () {
            var ch = App.Live.playingChannel();
            var opts = [
                { label: ch && App.Lib.isFav('live', ch.id) ? t('remove_favorites') : t('add_to_favorite'), value: 'fav' },
                { label: t('screen_ratio'), value: 'ratio', sub: App.Player.ratioLabel(App.Player.ratioMode()).replace(/^[^:]*:\s*/, '') },
                { label: t('audio_track'), value: 'audio' },
                { label: t('subtitles'), value: 'subs' }
            ];
            App.Dialog.choose(ch ? ch.name : t('live_tv'), opts, null).then(function (v) {
                if (v === 'fav' && ch) { App.Live.toggleFav(ch); F.renderLive(); }
                else if (v === 'ratio') F.chooseRatio();
                else if (v === 'audio') F.chooseTrack('audio');
                else if (v === 'subs') F.chooseTrack('text');
            });
        },
        chooseRatio: function () {
            var P = App.Player, modes = P.ratioModes(), cur = P.ratioMode();
            var desc = { fill: t('ratio_safe_fill_desc', 'Fills the screen, crops at most 5% at the edges'), fit: t('ratio_fit_desc', 'Whole picture, black bars if needed'),
                zoom: t('ratio_zoom_desc', 'Fills the screen, crops what does not fit'), stretch: t('ratio_stretch_desc', 'Fills the screen, distorts the picture'),
                auto: t('ratio_auto_desc', 'As the stream says') };
            var opts = modes.map(function (m) {
                return { label: P.ratioLabel(m).replace(/^[^:]*:\s*/, ''), desc: desc[m] || '', value: m, on: m === cur };
            });
            return App.Dialog.choose(t('screen_ratio'), opts, cur).then(function (v) {
                if (v !== null) P.setRatioMode(v);
            });
        },
        chooseTrack: function (kind) {
            var tracks = App.Player.engine.tracks(kind);
            var opts = tracks.map(function (tr) { return { label: tr.label, value: tr.index }; });
            var cur = null;
            tracks.forEach(function (tr) { if (tr.on) cur = tr.index; });
            if (kind === 'text') { opts.unshift({ label: t('no_subtitles'), value: -1 }); if (cur === null) cur = -1; }
            if (!opts.length) { App.toast(kind === 'audio' ? t('audio_track') + ': —' : t('subtitles') + ': —'); return; }
            App.Dialog.choose(kind === 'audio' ? t('audio_track') : t('subtitles'), opts, cur).then(function (v) {
                if (v !== null) App.Player.engine.setTrack(kind, v);
            });
        }
    };
})();
