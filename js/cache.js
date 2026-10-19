/*
 * Spremljena kopija playliste u IndexedDB-u ("Continue with saved data", Settings -> Clear cache).
 * localStorage je premalen za liste od desetaka tisuca stavki. Bez IndexedDB-a (stari MAG WebKit)
 * ili u lite nacinu sve funkcije tiho ne rade nista.
 */
(function () {
    var DB = 'lbbe_cache', STORE = 'playlists', db = null, opening = null;

    function idb() {
        try { return window.indexedDB || window.webkitIndexedDB || null; } catch (e) { return null; }
    }
    function open() {
        if (db) return Promise.resolve(db);
        if (opening) return opening;
        opening = new Promise(function (resolve, reject) {
            var f = idb();
            if (!f) { reject('no idb'); return; }
            var req;
            try { req = f.open(DB, 1); } catch (e) { reject(e); return; }
            req.onupgradeneeded = function () {
                try { req.result.createObjectStore(STORE, { keyPath: 'key' }); } catch (e) { }
            };
            req.onsuccess = function () { db = req.result; resolve(db); };
            req.onerror = function () { reject(req.error); };
            req.onblocked = function () { reject('blocked'); };
        });
        opening.then(null, function () { opening = null; });
        return opening;
    }
    function tx(mode, fn) {
        return open().then(function (d) {
            return new Promise(function (resolve, reject) {
                var t = d.transaction(STORE, mode);
                var st = t.objectStore(STORE);
                var out = fn(st);
                t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
                t.onerror = function () { reject(t.error); };
                t.onabort = function () { reject(t.error); };
            });
        });
    }

    App.Cache = {
        available: function () { return !!idb() && !(App.Platform && App.Platform.lite); },
        put: function (rec) {
            if (!App.Cache.available()) return Promise.resolve(false);
            // Samo jedna lista: stara kopija druge playliste nikome ne treba, a zauzima mjesto.
            return tx('readwrite', function (st) { st.clear(); st.put(rec); return true; })
                .then(function () { return true; }, function (e) { U.log('cache put failed', e); return false; });
        },
        get: function (key) {
            if (!App.Cache.available()) return Promise.resolve(null);
            return tx('readonly', function (st) { return st.get(key); }).then(function (r) { return r || null; }, function () { return null; });
        },
        has: function (key) {
            if (!App.Cache.available()) return Promise.resolve(false);
            return tx('readonly', function (st) { return st.count(key); }).then(function (n) { return n > 0; }, function () { return false; });
        },
        clear: function () {
            if (!App.Cache.available()) return Promise.resolve(true);
            return tx('readwrite', function (st) { st.clear(); return true; }).then(function () { return true; }, function () { return false; });
        }
    };
})();
