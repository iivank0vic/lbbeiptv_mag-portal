/*
 * Polyfillovi za MAG preglednik (MAG 250/254: QtWebKit 533-538). Ucitava se PRVI, prije svega
 * ostalog, i dodaje samo ono sto nedostaje — na novijim MAG-ovima (Chromium) ne radi nista.
 * Zajednicki kod smije koristiti samo: Promise (then/catch/resolve/reject/all/race),
 * Element.classList, Function.prototype.bind, requestAnimationFrame i XHR timeout.
 */
(function () {
    var w = window;

    /* ---------- Function.prototype.bind (Safari < 5.1) ---------- */
    if (!Function.prototype.bind) {
        Function.prototype.bind = function (ctx) {
            var fn = this, pre = Array.prototype.slice.call(arguments, 1);
            return function () { return fn.apply(ctx, pre.concat(Array.prototype.slice.call(arguments))); };
        };
    }

    /* ---------- requestAnimationFrame ---------- */
    if (!w.requestAnimationFrame) {
        w.requestAnimationFrame = w.webkitRequestAnimationFrame || function (cb) {
            return setTimeout(function () { cb(new Date().getTime()); }, 16);
        };
        w.cancelAnimationFrame = w.webkitCancelAnimationFrame || function (id) { clearTimeout(id); };
    }

    /* ---------- Element.classList (Safari < 5.1) ---------- */
    if (typeof document !== 'undefined' && !('classList' in document.createElement('div'))) {
        var ClassList = function (el) { this.el = el; };
        ClassList.prototype = {
            list: function () { var c = this.el.className; return c ? String(c).replace(/^\s+|\s+$/g, '').split(/\s+/) : []; },
            save: function (arr) { this.el.className = arr.join(' '); },
            contains: function (c) { return this.list().indexOf(c) >= 0; },
            add: function () {
                var l = this.list();
                for (var i = 0; i < arguments.length; i++) if (l.indexOf(arguments[i]) < 0) l.push(arguments[i]);
                this.save(l);
            },
            remove: function () {
                var l = this.list(), out = [];
                for (var i = 0; i < l.length; i++) {
                    var keep = true;
                    for (var j = 0; j < arguments.length; j++) if (l[i] === arguments[j]) keep = false;
                    if (keep) out.push(l[i]);
                }
                this.save(out);
            },
            toggle: function (c, force) {
                var on = force === undefined ? !this.contains(c) : !!force;
                if (on) this.add(c); else this.remove(c);
                return on;
            }
        };
        try {
            Object.defineProperty(Element.prototype, 'classList', {
                get: function () { return new ClassList(this); }, configurable: true
            });
        } catch (e) {
            if (Element.prototype.__defineGetter__) Element.prototype.__defineGetter__('classList', function () { return new ClassList(this); });
        }
    }

    /* ---------- XHR timeout (stari WebKit ga ignorira) ---------- */
    try {
        if (w.XMLHttpRequest && !('timeout' in new XMLHttpRequest())) {
            var send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function () {
                var x = this;
                if (x.timeout > 0) {
                    setTimeout(function () {
                        if (x.readyState === 4) return;
                        // ontimeout PRIJE abort-a: U.http tada javlja timeout, a ne "network".
                        try { if (x.ontimeout) x.ontimeout(); } catch (e) { }
                        try { x.abort(); } catch (e) { }
                    }, x.timeout);
                }
                return send.apply(x, arguments);
            };
        }
    } catch (e) { }

    /* ---------- Promise (minimalni, Promises/A+ ponasanje) ---------- */
    if (typeof w.Promise === 'function') return;

    var asap = function (fn) { setTimeout(fn, 0); };

    function P(executor) {
        var self = this;
        self._s = 0;        // 0 pending, 1 fulfilled, 2 rejected
        self._v = undefined;
        self._q = [];
        var once = false;
        try {
            executor(function (v) { if (!once) { once = true; resolveP(self, v); } },
                function (r) { if (!once) { once = true; settle(self, 2, r); } });
        } catch (e) { if (!once) { once = true; settle(self, 2, e); } }
    }
    function settle(p, s, v) {
        if (p._s) return;
        p._s = s; p._v = v;
        var q = p._q; p._q = [];
        for (var i = 0; i < q.length; i++) handle(p, q[i]);
    }
    function resolveP(p, v) {
        if (v === p) { settle(p, 2, new TypeError('Promise self-resolve')); return; }
        if (v && (typeof v === 'object' || typeof v === 'function')) {
            var then;
            try { then = v.then; } catch (e) { settle(p, 2, e); return; }
            if (typeof then === 'function') {
                var done = false;
                try {
                    then.call(v, function (y) { if (!done) { done = true; resolveP(p, y); } },
                        function (r) { if (!done) { done = true; settle(p, 2, r); } });
                } catch (e) { if (!done) { done = true; settle(p, 2, e); } }
                return;
            }
        }
        settle(p, 1, v);
    }
    function handle(p, h) {
        if (!p._s) { p._q.push(h); return; }
        asap(function () {
            var cb = p._s === 1 ? h.ok : h.err;
            if (typeof cb !== 'function') {
                if (p._s === 1) resolveP(h.p, p._v); else settle(h.p, 2, p._v);
                return;
            }
            var r;
            try { r = cb(p._v); } catch (e) { settle(h.p, 2, e); return; }
            resolveP(h.p, r);
        });
    }
    P.prototype.then = function (ok, err) {
        var np = new P(function () { });
        handle(this, { ok: ok, err: err, p: np });
        return np;
    };
    P.prototype['catch'] = function (err) { return this.then(null, err); };
    P.resolve = function (v) {
        if (v instanceof P) return v;
        return new P(function (res) { res(v); });
    };
    P.reject = function (r) { return new P(function (res, rej) { rej(r); }); };
    P.all = function (arr) {
        return new P(function (res, rej) {
            var out = [], left = arr.length;
            if (!left) { res(out); return; }
            for (var i = 0; i < arr.length; i++) {
                (function (i) {
                    P.resolve(arr[i]).then(function (v) {
                        out[i] = v;
                        if (--left === 0) res(out);
                    }, rej);
                })(i);
            }
        });
    };
    P.race = function (arr) {
        return new P(function (res, rej) {
            for (var i = 0; i < arr.length; i++) P.resolve(arr[i]).then(res, rej);
        });
    };
    w.Promise = P;
})();
