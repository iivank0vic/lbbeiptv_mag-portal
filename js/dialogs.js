/*
 * Dijalozi (Theme.Ui.Dialog): naslov, tijelo, lista opcija (radio / checkbox / obicna),
 * gumbi. Cancel = sekundarni gumb, potvrda = primarni (akcent u fokusu).
 */
(function () {
    var D = App.Dialog = {};

    /**
     * cfg: title, caption, body (html), width, options [{label, value, sub, on}], mode 'radio'|'check'|'list',
     * buttons [{label, act, primary, danger}], onOption(i, dlg), onButton(act, dlg), onBack(dlg),
     * focus 'list'|'buttons', setup(dlg) (dodatne zone), visibleRows.
     */
    D.open = function (cfg) {
        var host = U.byId('overlays');
        var wrap = document.createElement('div');
        var width = cfg.width || 1000;
        var opts = cfg.options || null;
        // Opcije su kartice (Android OptionDialog): s opisom su vise.
        var tall = !!(opts && opts.some(function (o) { return o.desc; }));
        var rowH = tall ? 120 : 92;
        var rows = opts ? Math.min(opts.length, cfg.visibleRows || (tall ? 5 : 7)) : 0;
        var html = '<div class="modal-back"></div><div class="dialog ' + (cfg.cls || '') + '" style="width:' + width + 'px;margin-left:' + (-width / 2) + 'px">';
        if (cfg.title) {
            html += '<div class="d-head"><div class="t-section">' + U.esc(cfg.title) + '</div>' +
                (cfg.caption ? '<div class="t-caption">' + U.esc(cfg.caption) + '</div>' : '') + '</div>';
        }
        if (cfg.body) html += '<div class="d-body">' + cfg.body + '</div>';
        if (opts) html += '<div class="d-list vlist" style="height:' + (rows * rowH - 12) + 'px"></div>';
        if (cfg.buttons && cfg.buttons.length) {
            html += '<div class="d-foot">';
            cfg.buttons.forEach(function (b) {
                html += '<div class="btn f' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + '" data-act="' + U.esc(b.act) + '">' + U.esc(b.label) + '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
        wrap.innerHTML = html;
        host.appendChild(wrap);
        var box = wrap.querySelector('.dialog');

        var dlg = { el: box, wrap: wrap, cfg: cfg, options: opts, closed: false };
        var layer = { name: 'dialog', zones: {}, zone: null };
        dlg.layer = layer;

        dlg.close = function () {
            if (dlg.closed) return;
            dlg.closed = true;
            Nav.pop(layer);
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
            if (cfg.onClose) cfg.onClose(dlg);
        };

        if (opts) {
            var listEl = box.querySelector('.d-list');
            dlg.list = new W.VList({
                el: listEl, name: 'list', rowH: rowH, rowCls: 'opt' + (tall ? ' tall' : '') + (cfg.mode === 'check' ? ' check' : (cfg.mode === 'radio' ? ' radio' : '')),
                count: function () { return opts.length; },
                cls: function (i) { return (opts[i].on ? 'on' : '') + (opts[i].danger ? ' danger' : ''); },
                inner: function (i) {
                    var o = opts[i];
                    return (cfg.mode === 'check' ? '<span class="mark"></span>' : '') +
                        (o.icon ? '<span class="oi">' + App.icon(o.icon) + '</span>' : '') +
                        '<span class="ol"><span class="ot">' + U.esc(o.label) + '</span>' + (o.desc ? '<span class="od">' + U.esc(o.desc) + '</span>' : '') + '</span>' +
                        (o.sub ? '<span class="ov">' + U.esc(o.sub) + '</span>' : '') +
                        (cfg.mode === 'radio' && o.on ? App.icon('check', 'okc') : '');
                },
                onOk: function (i) { if (cfg.onOption) cfg.onOption(i, dlg); },
                nb: { down: 'buttons' }
            });
            layer.zones.list = dlg.list;
        }
        if (cfg.buttons && cfg.buttons.length) {
            layer.zones.buttons = new W.Group({
                el: box.querySelector('.d-foot'), name: 'buttons',
                onOk: function (el) { if (cfg.onButton) cfg.onButton(el.getAttribute('data-act'), dlg); },
                nb: { up: opts ? 'list' : (cfg.upZone || null) }
            });
        }
        layer.onBack = function () { if (cfg.onBack) cfg.onBack(dlg); else dlg.close(); };
        if (cfg.onKey) layer.onKey = function (a) { return cfg.onKey(a, dlg); };
        if (cfg.setup) cfg.setup(dlg, layer);

        // Okomito centriranje nakon iscrtavanja.
        box.style.marginTop = (-Math.round(box.offsetHeight / 2)) + 'px';

        var start = cfg.focus || (opts ? 'list' : 'buttons');
        layer.zone = null;
        Nav.push(layer);
        if (dlg.list) {
            var sel = 0;
            for (var i = 0; i < opts.length; i++) if (opts[i].on) { sel = i; break; }
            dlg.list.reset(sel);
        }
        if (cfg.buttons && cfg.focusButton !== undefined) layer.zones.buttons.index = cfg.focusButton;
        if (!Nav.focus(start)) {
            if (!Nav.focus('buttons')) Nav.focus('list');
        }
        return dlg;
    };

    /** Da/Ne. Promise<boolean>. */
    D.confirm = function (title, text, yes, no, danger) {
        return new Promise(function (resolve) {
            D.open({
                title: title, body: text ? U.esc(text) : '', width: 900,
                buttons: [{ label: no || t('no'), act: 'no' }, { label: yes || t('yes'), act: 'yes', primary: !danger, danger: danger }],
                // Opasna radnja (izlaz): fokus na "Ne" da slucajni OK ne zatvori aplikaciju.
                focusButton: danger ? 0 : 1,
                onButton: function (act, dlg) { dlg.close(); resolve(act === 'yes'); },
                onBack: function (dlg) { dlg.close(); resolve(false); }
            });
        });
    };

    /** Odabir jedne vrijednosti (radio). Promise<value|null>. */
    D.choose = function (title, options, selected, caption) {
        return new Promise(function (resolve) {
            var opts = options.map(function (o) { return { label: o.label, desc: o.desc, icon: o.icon, value: o.value, sub: o.sub, on: o.value === selected }; });
            D.open({
                title: title, caption: caption, options: opts, mode: 'radio', width: 900,
                buttons: [{ label: t('cancel'), act: 'cancel' }],
                onOption: function (i, dlg) { dlg.close(); resolve(opts[i].value); },
                onButton: function (act, dlg) { dlg.close(); resolve(null); },
                onBack: function (dlg) { dlg.close(); resolve(null); }
            });
        });
    };

    /**
     * Izbor radnje (Android OptionDialog): kartice s ikonom, naslovom i opisom + Cancel.
     * options: [{value, label, desc, icon, danger}]. Promise<value|null>.
     */
    D.options = function (title, options, caption) {
        return new Promise(function (resolve) {
            var opts = options.map(function (o) { return { label: o.label, value: o.value, desc: o.desc, icon: o.icon, danger: o.danger, on: !!o.on }; });
            D.open({
                title: title, caption: caption, options: opts, mode: 'radio', width: 1100,
                buttons: [{ label: t('cancel'), act: 'cancel' }],
                onOption: function (i, dlg) { dlg.close(); resolve(opts[i].value); },
                onButton: function (act, dlg) { dlg.close(); resolve(null); },
                onBack: function (dlg) { dlg.close(); resolve(null); }
            });
        });
    };

    /** Visestruki odabir (skrivanje kategorija). Promise<ids|null>. */
    D.multi = function (title, caption, options) {
        return new Promise(function (resolve) {
            var opts = options.map(function (o) { return { label: o.label, value: o.value, sub: o.sub, on: !!o.on }; });
            D.open({
                title: title, caption: caption, options: opts, mode: 'check', width: 1000, visibleRows: 7,
                buttons: [{ label: t('select_all'), act: 'all' }, { label: t('cancel'), act: 'cancel' }, { label: t('ok'), act: 'ok', primary: true }],
                onOption: function (i, dlg) { opts[i].on = !opts[i].on; dlg.list.repaint(); },
                onButton: function (act, dlg) {
                    if (act === 'all') {
                        var allOn = opts.every(function (o) { return o.on; });
                        opts.forEach(function (o) { o.on = !allOn; });
                        dlg.list.repaint();
                        return;
                    }
                    dlg.close();
                    if (act === 'ok') resolve(opts.filter(function (o) { return o.on; }).map(function (o) { return o.value; }));
                    else resolve(null);
                },
                onBack: function (dlg) { dlg.close(); resolve(null); }
            });
        });
    };

    /**
     * PIN unos: 4 znamenke, numericka tipkovnica na ekranu + brojevi na daljinskom.
     * steps: [{label}] — vise koraka (npr. stari / novi / potvrda). Promise<[pin,...]|null>.
     */
    D.pin = function (title, steps, validate) {
        return new Promise(function (resolve) {
            var step = 0, val = '', results = [];
            var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
            var body = '<div class="pin-label"></div><div class="pin-boxes">' +
                '<span class="pin-box"></span><span class="pin-box"></span><span class="pin-box"></span><span class="pin-box"></span></div>' +
                '<div class="pin-err"></div><div class="keypad">';
            keys.forEach(function (k) {
                body += '<div class="key f' + (k === 'ok' ? ' ok' : '') + '" data-k="' + k + '">' +
                    (k === 'del' ? App.icon('backspace') : (k === 'ok' ? App.icon('check') : k)) + '</div>';
            });
            body += '</div>';
            var dlg;
            function paint() {
                var boxes = U.qsa('.pin-box', dlg.el);
                for (var i = 0; i < 4; i++) {
                    boxes[i].textContent = i < val.length ? '•' : '';
                    U.toggle(boxes[i], 'cur', i === val.length);
                }
                U.qs('.pin-label', dlg.el).textContent = steps[step].label;
            }
            function err(msg) { U.qs('.pin-err', dlg.el).textContent = msg || ''; }
            function submit() {
                if (val.length < 4) return;
                var check = validate ? validate(step, val, results) : null;
                if (check) { err(check); val = ''; paint(); return; }
                results.push(val);
                val = '';
                err('');
                if (step < steps.length - 1) { step++; paint(); return; }
                dlg.close();
                resolve(results);
            }
            function press(k) {
                if (k === 'del') { val = val.substr(0, Math.max(0, val.length - 1)); err(''); }
                else if (k === 'ok') { submit(); return; }
                else if (val.length < 4) { val += k; err(''); }
                paint();
                if (val.length === 4) setTimeout(submit, 120);
            }
            dlg = D.open({
                title: title, body: body, width: 820,
                setup: function (d, layer) {
                    layer.zones.pad = new W.Group({
                        el: d.el.querySelector('.keypad'), name: 'pad',
                        onOk: function (el) { press(el.getAttribute('data-k')); }
                    });
                    layer.onKey = function (a) {
                        if (/^[0-9]$/.test(a)) { press(a); return true; }
                        return false;
                    };
                },
                focus: 'pad',
                onBack: function (d) { d.close(); resolve(null); }
            });
            paint();
        });
    };

    /** Provjera roditeljskog PIN-a. Promise<boolean>. */
    D.askPin = function () {
        return D.pin(t('parent_password'), [{ label: t('parent_password') }], function (s, v) {
            return v === String(App.Settings.get('pin')) ? null : t('pin_incorrect');
        }).then(function (r) { return !!r; });
    };

    /** Promjena PIN-a: stari, novi, potvrda. */
    D.changePin = function () {
        return D.pin(t('parent_control'), [
            { label: t('old_password') }, { label: t('new_password') }, { label: t('confirm_password') }
        ], function (step, v, prev) {
            if (step === 0 && v !== String(App.Settings.get('pin'))) return t('pin_incorrect');
            if (step === 2 && v !== prev[1]) return t('pin_mismatch');
            return null;
        }).then(function (r) {
            if (!r) return false;
            App.Settings.set('pin', r[1]);
            App.toast(t('pin_changed'));
            return true;
        });
    };
})();
