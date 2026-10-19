/*
 * Zone za Nav: VList (virtualna lista), VGrid (virtualni grid), HRow (vodoravni red)
 * i Group (staticni elementi s geometrijskom navigacijom). Virtualizacija je obavezna:
 * playliste imaju desetke tisuca stavki, a TV-i malo memorije.
 */
(function () {
    var W = window.W = App.W = {};

    function hasCls(el, c) { return el && el.classList && el.classList.contains(c); }

    /* ======================= VList ======================= */
    /**
     * opts: el, name, rowH, rowCls, count(), inner(i), cls(i) (dodatne klase), onOk(i), onFocus(i),
     * onLeft(i), onRight(i) (vrate true ako su obradile), nb, pad (redovi iznad/ispod pri skrolanju),
     * page (koliko redova preskace CH+/CH-).
     */
    W.VList = function (opts) {
        var self = this;
        this.o = opts;
        this.el = opts.el;
        this.name = opts.name;
        this.nb = opts.nb || {};
        this.index = 0;
        this.scroll = 0;
        this.active = false;
        this.el.innerHTML = '<div class="vlist-inner"></div>';
        this.inner = this.el.firstChild;
        this.first = -1; this.last = -1;
        this.viewH = 0;
    };
    W.VList.prototype = {
        count: function () { return this.o.count(); },
        measure: function () { this.viewH = this.el.clientHeight || this.o.viewH || 600; },
        reset: function (index) {
            this.measure();
            var n = this.count();
            this.index = U.clamp(index || 0, 0, Math.max(0, n - 1));
            this.scroll = 0;
            this.ensure(true);
            this.render(true);
        },
        refresh: function () { this.measure(); this.ensure(true); this.render(true); },
        ensure: function (center) {
            var h = this.o.rowH, n = this.count();
            var total = n * h;
            var top = this.index * h;
            var pad = (this.o.pad === undefined ? 1 : this.o.pad) * h;
            if (center) {
                this.scroll = top - Math.floor((this.viewH - h) / 2);
            } else {
                if (top - pad < this.scroll) this.scroll = top - pad;
                if (top + h + pad > this.scroll + this.viewH) this.scroll = top + h + pad - this.viewH;
            }
            this.scroll = U.clamp(this.scroll, 0, Math.max(0, total - this.viewH));
        },
        render: function (force) {
            var h = this.o.rowH, n = this.count();
            var first = Math.max(0, Math.floor(this.scroll / h) - 2);
            var last = Math.min(n - 1, Math.ceil((this.scroll + this.viewH) / h) + 2);
            this.inner.style.height = (n * h) + 'px';
            this.inner.style.webkitTransform = 'translateY(' + (-this.scroll) + 'px)';
            this.inner.style.transform = 'translateY(' + (-this.scroll) + 'px)';
            if (!force && first === this.first && last === this.last) { this.paintFocus(); return; }
            this.first = first; this.last = last;
            var html = '';
            for (var i = first; i <= last; i++) {
                var cls = this.o.rowCls + (this.o.cls ? ' ' + (this.o.cls(i) || '') : '') + (this.active && i === this.index ? ' focus' : '');
                html += '<div class="' + cls + '" style="top:' + (i * h) + 'px" data-z="' + this.name + '" data-i="' + i + '">' + this.o.inner(i) + '</div>';
            }
            this.inner.innerHTML = html;
        },
        paintFocus: function () {
            var nodes = this.inner.childNodes;
            for (var k = 0; k < nodes.length; k++) {
                var i = parseInt(nodes[k].getAttribute('data-i'), 10);
                U.toggle(nodes[k], 'focus', this.active && i === this.index);
            }
        },
        /** Ponovno iscrta jedan red (npr. promjena favorita). */
        repaint: function () { this.render(true); },
        move: function (d) {
            var n = this.count();
            if (!n) return false;
            var ni = U.clamp(this.index + d, 0, n - 1);
            if (ni === this.index) return false;
            this.index = ni;
            this.ensure(false);
            this.render(false);
            if (this.o.onFocus) this.o.onFocus(this.index);
            return true;
        },
        setIndex: function (i) {
            if (i === this.index) return;
            this.index = U.clamp(i, 0, Math.max(0, this.count() - 1));
            this.paintFocus();
            if (this.o.onFocus) this.o.onFocus(this.index);
        },
        key: function (a) {
            var n = this.count();
            if (a === 'up') return this.index > 0 ? this.move(-1) : false;
            if (a === 'down') return this.index < n - 1 ? this.move(1) : false;
            if (a === 'chup' || a === 'pageup') { if (this.o.noPage) return false; this.move(-(this.o.page || 10)); return true; }
            if (a === 'chdown' || a === 'pagedown') { if (this.o.noPage) return false; this.move(this.o.page || 10); return true; }
            if (a === 'ok') { if (n && this.o.onOk) this.o.onOk(this.index); return true; }
            if (a === 'left' && this.o.onLeft) return this.o.onLeft(this.index);
            if (a === 'right' && this.o.onRight) return this.o.onRight(this.index);
            if (this.o.onKey) return this.o.onKey(a, this.index);
            return false;
        },
        focus: function (arg) {
            this.active = true;
            if (arg && arg.index !== undefined) this.index = arg.index;
            if (!this.viewH) this.measure();
            this.ensure(false);
            this.render(false);
            this.paintFocus();
            if (this.o.onFocus && !(arg && arg.silent)) this.o.onFocus(this.index);
        },
        blur: function () { this.active = false; this.paintFocus(); },
        canFocus: function () { return this.count() > 0 && !hasCls(this.el, 'hidden') && this.el.offsetParent !== null; }
    };

    /* ======================= VGrid ======================= */
    /** opts: el, name, cols, rowH, count(), inner(i), cellCls, onOk(i), onFocus(i), nb */
    W.VGrid = function (opts) {
        this.o = opts;
        this.el = opts.el;
        this.name = opts.name;
        this.nb = opts.nb || {};
        this.index = 0;
        this.scroll = 0;
        this.active = false;
        this.el.innerHTML = '<div class="vlist-inner"></div>';
        this.inner = this.el.firstChild;
        this.first = -1; this.last = -1;
    };
    W.VGrid.prototype = {
        count: function () { return this.o.count(); },
        measure: function () {
            this.viewH = this.el.clientHeight || 800;
            this.viewW = this.el.clientWidth || 1200;
            this.cellW = Math.floor(this.viewW / this.o.cols);
            this.rowH = this.o.rowH(this.cellW);
        },
        reset: function (index) {
            this.measure();
            this.index = U.clamp(index || 0, 0, Math.max(0, this.count() - 1));
            this.scroll = 0;
            this.ensure();
            this.render(true);
        },
        ensure: function () {
            var row = Math.floor(this.index / this.o.cols);
            var top = row * this.rowH;
            var rows = Math.ceil(this.count() / this.o.cols);
            // Fokusirani red drzi u gornjoj trecini (kao Leanback grid), bez skakanja na pocetku.
            if (top < this.scroll) this.scroll = top;
            if (top + this.rowH > this.scroll + this.viewH) this.scroll = top + this.rowH - this.viewH + 20;
            this.scroll = U.clamp(this.scroll, 0, Math.max(0, rows * this.rowH - this.viewH + 40));
        },
        render: function (force) {
            var cols = this.o.cols, n = this.count();
            var firstRow = Math.max(0, Math.floor(this.scroll / this.rowH) - 1);
            var lastRow = Math.ceil((this.scroll + this.viewH) / this.rowH) + 1;
            var first = firstRow * cols, last = Math.min(n - 1, (lastRow + 1) * cols - 1);
            var rows = Math.ceil(n / cols);
            this.inner.style.height = (rows * this.rowH) + 'px';
            this.inner.style.webkitTransform = 'translateY(' + (-this.scroll) + 'px)';
            this.inner.style.transform = 'translateY(' + (-this.scroll) + 'px)';
            if (!force && first === this.first && last === this.last) { this.paintFocus(); return; }
            this.first = first; this.last = last;
            var html = '';
            for (var i = first; i <= last; i++) {
                var r = Math.floor(i / cols), c = i % cols;
                html += '<div class="' + this.o.cellCls + (this.active && i === this.index ? ' focus' : '') + '" style="left:' + (c * this.cellW) + 'px;top:' + (r * this.rowH) +
                    'px;width:' + this.cellW + 'px" data-z="' + this.name + '" data-i="' + i + '">' + this.o.inner(i, this.cellW) + '</div>';
            }
            this.inner.innerHTML = html;
        },
        paintFocus: function () {
            var nodes = this.inner.childNodes;
            for (var k = 0; k < nodes.length; k++) {
                var i = parseInt(nodes[k].getAttribute('data-i'), 10);
                U.toggle(nodes[k], 'focus', this.active && i === this.index);
            }
        },
        go: function (ni) {
            this.index = ni;
            this.ensure();
            this.render(false);
            if (this.o.onFocus) this.o.onFocus(this.index);
            return true;
        },
        setIndex: function (i) { this.index = i; this.paintFocus(); },
        key: function (a) {
            var cols = this.o.cols, n = this.count(), i = this.index;
            if (a === 'left') return (i % cols) > 0 ? this.go(i - 1) : false;
            if (a === 'right') return ((i % cols) < cols - 1 && i + 1 < n) ? this.go(i + 1) : false;
            if (a === 'up') return i - cols >= 0 ? this.go(i - cols) : false;
            if (a === 'down') {
                if (i + cols < n) return this.go(i + cols);
                // Zadnji (nepuni) red: idi na zadnju stavku.
                if (Math.floor(i / cols) < Math.floor((n - 1) / cols)) return this.go(n - 1);
                return false;
            }
            if (a === 'chdown' || a === 'pagedown') return this.go(Math.min(n - 1, i + cols * 3));
            if (a === 'chup' || a === 'pageup') return this.go(Math.max(0, i - cols * 3));
            if (a === 'ok') { if (n && this.o.onOk) this.o.onOk(i); return true; }
            if (this.o.onKey) return this.o.onKey(a, i);
            return false;
        },
        focus: function (arg) {
            this.active = true;
            if (!this.viewH) this.measure();
            this.ensure();
            this.render(false);
            this.paintFocus();
            if (this.o.onFocus) this.o.onFocus(this.index);
        },
        blur: function () { this.active = false; this.paintFocus(); },
        canFocus: function () { return this.count() > 0 && this.el.offsetParent !== null; }
    };

    /* ======================= HRow ======================= */
    /** Vodoravni red kartica (Home). opts: el (row-track), name, items[], inner(item,i), cardCls, onOk(i), onFocus(i), nb */
    W.HRow = function (opts) {
        this.o = opts;
        this.el = opts.el;
        this.name = opts.name;
        this.nb = opts.nb || {};
        this.index = 0;
        this.offset = 0;
        this.active = false;
        var html = '<div class="row-inner">';
        for (var i = 0; i < opts.items.length; i++) {
            html += '<div class="row-card ' + (opts.cardCls || '') + '" data-z="' + this.name + '" data-i="' + i + '">' + opts.inner(opts.items[i], i) + '</div>';
        }
        this.el.innerHTML = html + '</div>';
        this.inner = this.el.firstChild;
        this.cards = this.inner.childNodes;
    };
    W.HRow.prototype = {
        paint: function () {
            for (var i = 0; i < this.cards.length; i++) U.toggle(this.cards[i], 'focus', this.active && i === this.index);
            var card = this.cards[this.index];
            if (!card) return;
            var w = card.offsetWidth + 24;
            var viewW = this.el.clientWidth - 120;
            var x = this.index * w;
            if (x - this.offset > viewW - w) this.offset = x - viewW + w;
            if (x < this.offset) this.offset = x;
            this.offset = Math.max(0, this.offset);
            this.inner.style.webkitTransform = 'translateX(' + (-this.offset) + 'px)';
            this.inner.style.transform = 'translateX(' + (-this.offset) + 'px)';
        },
        setIndex: function (i) { this.index = i; this.paint(); },
        key: function (a) {
            if (a === 'left') { if (this.index > 0) { this.index--; this.paint(); return true; } return false; }
            if (a === 'right') { if (this.index < this.cards.length - 1) { this.index++; this.paint(); return true; } return true; }
            if (a === 'ok') { if (this.o.onOk) this.o.onOk(this.index); return true; }
            if (this.o.onKey) return this.o.onKey(a, this.index);
            return false;
        },
        focus: function () { this.active = true; this.paint(); if (this.o.onFocus) this.o.onFocus(this.index); },
        blur: function () { this.active = false; this.paint(); },
        canFocus: function () { return this.cards.length > 0; }
    };

    /* ======================= Group ======================= */
    /**
     * Staticni fokusabilni elementi (.f) unutar el; navigacija geometrijski (najblizi u smjeru).
     * opts: el, name, onOk(el, i), onFocus(el, i), nb, scroller {view, inner} za okomito skrolanje,
     * wrapH (true = lijevo/desno kruzi u redu), keys(a, el, i).
     */
    W.Group = function (opts) {
        this.o = opts;
        this.el = opts.el;
        this.name = opts.name;
        this.nb = opts.nb || {};
        this.index = opts.index || 0;
        this.active = false;
        this.offset = 0;
        this.scan();
    };
    W.Group.prototype = {
        scan: function () {
            this.items = U.qsa('.f', this.el).filter(function (e) { return !hasCls(e, 'hidden') && !hasCls(e, 'disabled'); });
            for (var i = 0; i < this.items.length; i++) {
                this.items[i].setAttribute('data-z', this.name);
                this.items[i].setAttribute('data-i', i);
            }
            if (this.index >= this.items.length) this.index = Math.max(0, this.items.length - 1);
        },
        cur: function () { return this.items[this.index]; },
        paint: function () {
            for (var i = 0; i < this.items.length; i++) U.toggle(this.items[i], 'focus', this.active && i === this.index);
            this.scrollTo();
        },
        scrollTo: function () {
            var s = this.o.scroller;
            var el = this.cur();
            if (!s || !el) return;
            var viewH = s.view.clientHeight;
            var top = 0, n = el;
            while (n && n !== s.inner) { top += n.offsetTop; n = n.offsetParent; }
            var h = el.offsetHeight;
            var margin = s.margin || 60;
            if (top - margin < this.offset) this.offset = top - margin;
            if (top + h + margin > this.offset + viewH) this.offset = top + h + margin - viewH;
            var max = Math.max(0, s.inner.offsetHeight - viewH);
            this.offset = U.clamp(this.offset, 0, max);
            if (this.index === 0) this.offset = 0;
            s.inner.style.webkitTransform = 'translateY(' + (-this.offset) + 'px)';
            s.inner.style.transform = 'translateY(' + (-this.offset) + 'px)';
        },
        rect: function (el) {
            var r = el.getBoundingClientRect();
            return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
        },
        /** Najblizi element u smjeru; preklapanje na drugoj osi ima prednost. */
        find: function (dir) {
            var from = this.cur();
            if (!from) return -1;
            var a = this.rect(from);
            var best = -1, bestScore = Infinity;
            for (var i = 0; i < this.items.length; i++) {
                if (i === this.index) continue;
                var b = this.rect(this.items[i]);
                var primary, secondary, overlap;
                if (dir === 'right') { if (b.l < a.r - 4) continue; primary = b.l - a.r; overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t); secondary = Math.abs(b.cy - a.cy); }
                else if (dir === 'left') { if (b.r > a.l + 4) continue; primary = a.l - b.r; overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t); secondary = Math.abs(b.cy - a.cy); }
                else if (dir === 'down') { if (b.t < a.b - 4) continue; primary = b.t - a.b; overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l); secondary = Math.abs(b.cx - a.cx); }
                else { if (b.b > a.t + 4) continue; primary = a.t - b.b; overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l); secondary = Math.abs(b.cx - a.cx); }
                var score = Math.max(0, primary) + secondary * (overlap > 0 ? 0.3 : 2.5) + (overlap > 0 ? 0 : 400);
                if (score < bestScore) { bestScore = score; best = i; }
            }
            return best;
        },
        setIndex: function (i) {
            if (i < 0 || i >= this.items.length) return;
            this.index = i;
            this.paint();
            if (this.o.onFocus) this.o.onFocus(this.cur(), i);
        },
        key: function (a) {
            if (this.o.keys && this.o.keys(a, this.cur(), this.index)) return true;
            if (a === 'ok') {
                var el = this.cur();
                if (el && this.o.onOk) this.o.onOk(el, this.index);
                return true;
            }
            if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
                if (this.o.linear) {
                    var d = (a === this.o.linear[0]) ? -1 : (a === this.o.linear[1] ? 1 : 0);
                    if (!d) return false;
                    var ni = this.index + d;
                    if (ni < 0 || ni >= this.items.length) return false;
                    this.setIndex(ni);
                    return true;
                }
                var n = this.find(a);
                if (n < 0) return false;
                this.setIndex(n);
                return true;
            }
            return false;
        },
        focus: function (arg) {
            this.active = true;
            this.scan();
            if (arg && arg.index !== undefined && !isNaN(arg.index)) this.index = arg.index;
            this.paint();
            if (this.o.onFocus) this.o.onFocus(this.cur(), this.index);
        },
        blur: function () { this.active = false; this.paint(); },
        canFocus: function () { this.scan(); return this.items.length > 0 && this.el.offsetParent !== null; }
    };
})();
