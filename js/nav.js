/*
 * Upravljanje fokusom za daljinski (D-pad). Slojevi (ekran, dijalog, puni ekran) su na stogu;
 * svaki sloj ima zone (traka, kategorije, grid ...). Tipka ide: sloj.onKey -> zona.key ->
 * susjedna zona (zona.nb[smjer]) -> sloj.onBack za BACK.
 * Pravila fokusa i BACK-a su ista kao na Androidu (APP.md §3).
 */
(function () {
    var Nav = window.Nav = App.Nav = {
        layers: [],
        locked: false,

        top: function () { return Nav.layers[Nav.layers.length - 1] || null; },

        push: function (layer) {
            var cur = Nav.top();
            if (cur && cur.zone && cur.zones[cur.zone]) cur.zones[cur.zone].blur();
            layer.zones = layer.zones || {};
            Nav.layers.push(layer);
            if (layer.zone) Nav.focus(layer.zone);
            return layer;
        },
        pop: function (layer) {
            var i = Nav.layers.indexOf(layer || Nav.top());
            if (i < 0) return;
            var l = Nav.layers[i];
            if (l.zone && l.zones[l.zone]) l.zones[l.zone].blur();
            Nav.layers.splice(i, 1);
            var top = Nav.top();
            if (top && top.zone && top.zones[top.zone]) {
                top.zones[top.zone].focus();
                if (top.onFocusZone) top.onFocusZone(top.zone);
            }
        },
        /** Fokus na zonu u gornjem (ili zadanom) sloju. */
        focus: function (name, arg, layer) {
            layer = layer || Nav.top();
            if (!layer) return false;
            var z = layer.zones[name];
            if (!z) return false;
            if (z.canFocus && !z.canFocus()) return false;
            if (layer.zone && layer.zone !== name && layer.zones[layer.zone]) layer.zones[layer.zone].blur();
            layer.zone = name;
            if (layer === Nav.top()) z.focus(arg);
            if (layer.onFocusZone) layer.onFocusZone(name);
            return true;
        },
        current: function () {
            var l = Nav.top();
            return l ? l.zone : null;
        },
        zone: function () {
            var l = Nav.top();
            return l && l.zone ? l.zones[l.zone] : null;
        },

        handle: function (e) {
            var action = App.Platform.keyAction(e);
            if (!action) return;
            var layer = Nav.top();
            if (!layer) return;
            // Polje za unos (pretraga): pusti tipkovnicu da radi, osim navigacije prema van.
            var ae = document.activeElement;
            if (ae && ae.tagName === 'INPUT') {
                if (action === 'up' || action === 'down' || action === 'back' || action === 'done' || action === 'cancel') {
                    e.preventDefault();
                    ae.blur();
                    if (action === 'back' || action === 'cancel') action = 'input-back';
                    else if (action === 'done') action = 'down';
                } else {
                    return;
                }
            }
            e.preventDefault();
            if (Nav.locked) return;
            Nav.dispatch(action, e);
        },

        dispatch: function (action, e) {
            var layer = Nav.top();
            if (!layer) return;
            if (layer.onKey && layer.onKey(action, e)) return;
            var z = layer.zone ? layer.zones[layer.zone] : null;
            if (z && z.key && z.key(action, e)) return;
            if (action === 'input-back') action = 'back';
            if (z && (action === 'up' || action === 'down' || action === 'left' || action === 'right')) {
                var nb = z.nb ? z.nb[action] : null;
                if (typeof nb === 'function') nb = nb();
                if (nb) {
                    var tries = typeof nb === 'string' ? [nb] : nb;
                    for (var i = 0; i < tries.length; i++) if (Nav.focus(tries[i], { from: action })) return;
                }
                if (layer.onEdge) layer.onEdge(action);
                return;
            }
            if (action === 'back') {
                if (layer.onBack) layer.onBack();
                return;
            }
            if (layer.onUnhandled) layer.onUnhandled(action, e);
        },

        /** Mis / Magic Remote: element s data-z (zona) i data-i (indeks). */
        pointer: function (el, click) {
            var layer = Nav.top();
            if (!layer || !el) return;
            var zname = el.getAttribute('data-z');
            var z = layer.zones[zname];
            if (!z) return;
            var idx = parseInt(el.getAttribute('data-i'), 10);
            if (layer.zone !== zname) Nav.focus(zname, { pointer: true, index: idx });
            if (z.setIndex && !isNaN(idx)) z.setIndex(idx);
            if (click && z.key) z.key('ok');
        }
    };

    document.addEventListener('keydown', function (e) { Nav.handle(e); }, true);

    // Magic Remote / mis: hover = fokus, klik = OK.
    function findTarget(node) {
        while (node && node !== document.body) {
            if (node.getAttribute && node.getAttribute('data-z')) return node;
            node = node.parentNode;
        }
        return null;
    }
    var lastHover = null;
    document.addEventListener('mouseover', function (e) {
        var el = findTarget(e.target);
        if (el && el !== lastHover) { lastHover = el; Nav.pointer(el, false); }
    });
    document.addEventListener('click', function (e) {
        var el = findTarget(e.target);
        if (el) { e.preventDefault(); Nav.pointer(el, true); }
    });
    // Kotacic: gore/dolje u trenutnoj zoni.
    document.addEventListener('wheel', function (e) {
        var z = Nav.zone();
        if (!z || !z.key) return;
        z.key(e.deltaY > 0 ? 'down' : 'up');
    });
})();
