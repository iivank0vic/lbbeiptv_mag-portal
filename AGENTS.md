# AGENTS.md — upute za AI agente i developere (LG webOS, Samsung Tizen i MAG portal)

TV web klijent LBBE IPTV playera. **Izvor istine za izgled i ponašanje je `APP.md` Android aplikacije**
(sekcije, navigacija, fokus/BACK, dizajn tokeni). Ovaj kod mora izgledati i raditi isto kao Android TV verzija.

## Jedan kod, tri repozitorija

- `lbbeiptv_lgtv-app`, `lbbeiptv_samsung-app` i `lbbeiptv_mag-portal` imaju **identične** datoteke osim:
  `js/platform.js`, manifesta (`appinfo.json` / `config.xml`), ikona, SDK linije u `index.html`
  (`webOSTVjs` / `$WEBAPIS` / `mag/polyfills.js`), `webOSTVjs-1.2.0/` (samo LG) i `mag/` (samo MAG).
- Opcionalni hookovi u `platform.js` (`authQuery`, `pairCode`) postoje samo gdje ih platforma treba (MAG).
- Svaku promjenu zajedničkog koda prenesi u drugi repozitorij: `tools/sync.sh <putanja-do-drugog-repoa>`.
- Ništa specifično za platformu ne ide izvan `js/platform.js`. Ako treba nova mogućnost platforme,
  dodaj metodu u **oba** `platform.js` (isto sučelje).

## Pravila (obavezno)

1. **ES5.** Bez `=>`, `let/const`, template stringova, `class`, destrukturiranja, `fetch`, `Object.assign`,
   `includes`. Stari TV-i (Chromium 38–56) i MAG 250/254 (WebKit 533–538) inače ne pokrenu aplikaciju.
   `Promise`, `classList` i `bind` na MAG-u dolaze iz `mag/polyfills.js` — ne koristiti ništa izvan toga. Provjera:
   `for f in $(find js -name "*.js"); do npx acorn --ecma5 --silent "$f" || echo "$f"; done`.
2. **CSS bez varijabli, `gap` u flexu, grida i `aspect-ratio`.** `-webkit-` prefikse (stari WebKit na MAG-u)
   ne pisati ručno: nakon svake promjene CSS-a pokreni `tools/prefix-css.sh`. Boje i mjere su tokeni iz tablice na vrhu
   `css/app.css` (= Android `ui_*` × 2 px na 1080p). Nova boja = postojeći token.
3. **Bez sinkronih zahtjeva** i bez vanjskih skripti/fontova (CDN) — sve lokalno. Mrežni pozivi samo kroz
   `U.http` / `U.getJSON` (timeout, greške).
4. **Velike liste samo kroz `W.VList` / `W.VGrid`** (virtualizacija). Playliste imaju desetke tisuća stavki.
5. **Fokus:** svaki fokusabilni element ima vidljiv bijeli prsten (klasa `.focus`). Novi ekran = novi sloj u
   `Nav` (zone + `onBack`) i mora proći tablicu fokusa/BACK iz `APP.md` §3. BACK nikad ne izlazi iz
   aplikacije u jednom koraku.
6. **Tekstovi:** uvijek `t('kljuc')` (server prijevod, engleski fallback u `js/i18n.js`). Ne upisivati tekst u HTML.
7. **XSS:** sve iz playliste/servera kroz `U.esc()` i `U.safeUrl()` prije upisa u HTML.
8. **Video ispod web sloja:** AVPlay (Samsung) i `#video-layer` crtaju se ISPOD stranice. Prozirnost
   pravokutnika pregleda rješavaju klase `av-hole` / `fullscreen-video` (`App.rootClass`) — ne stavljati
   neprozirne pozadine na `html`, `body`, `#app`, `#shell`, `#content`, `#panel-live`.
9. Komentari kratki, HR ili EN, o *zašto*.

## Zamke

- LG ID uređaja = LGUDID pretvoren u MAC oblik (12 znakova). **Ne mijenjati formulu** — na njoj su registracije.
- Samsung MAC: Ethernet → Wi-Fi → `webapis.network.getMac()` → nasumični ID spremljen na TV-u
  (stara verzija je svima davala isti MAC `52:54:00:12:34:52`).
- Catch-up URL: `/streaming/timeshift.php?username=&password=&stream=&start=YYYY-MM-DD:HH-MM&duration=` —
  početak je u vremenu **servera** (iz tekstualnog `start` u EPG-u), ne u vremenu TV-a.
- `timeshift.php` ne javlja trajanje: premotavanje = ponovno otvaranje s novim `start` (minutna preciznost).
- Xtream `exp_date` null/0 = neograničeno. Neki serveri vraćaju objekt umjesto niza → `U.toArray`.
- Ako Xtream API ne radi, isti URL se pokušava kao M3U; ako ni to ne uspije, prikazuje se izvorna greška.
- localStorage je mali na TV-u: pozicije nastavka su ograničene na 300 zapisa po vrsti. Playlista ide u
  IndexedDB (`js/cache.js`, samo jedna); bez IndexedDB-a ili u MAG lite načinu cache tiho ne radi.
- **Pairing / ključ uređaja (API-SECURITY.md):** `Api.deviceKey()` je 64 hex znaka, nastaje jednom; nikad se
  ne prikazuje ni logira. 403 `{"error":"pairing_required"}` uvijek vodi na pairing ekran — tada se NE nastavlja
  sa spremljenim podacima. "Clear all data" čuva `lbbe_device_key`, `lbbe_device_id`, `lbbe_device_token`.
- **ID-jevi M3U stavki su stabilni** (hash URL-a / imena): favoriti i nastavak prežive ponovno učitavanje.
  Ne vraćati redni broj kao ID.
- **Slika:** naziv načina se pamti (`ratio_mode`), ne indeks; engine koji nema taj način koristi svoj prvi.
  HTML5 sam računa veličinu `<video>` (`App.aspectSize`), `#video-layer` reže višak.
- **Ponovno spajanje:** `Player.onError` → do 3 pokušaja; stanje `reconnecting` se prikazuje u pregledu i punom
  ekranu. VOD nastavlja od `Player.lastTime`.
- "Zadnja gledana epizoda" se upisuje tek kad epizoda krene (`media.onPlay`), ne kad se gradi `next()`/`prev()`.

## Provjera bez TV-a

Lokalni server + Chrome 1920x1080; proći sve sekcije samo tipkovnicom (strelice, Enter, Backspace),
uključujući BACK do dijaloga za izlaz. Na TV-u: `ares-inspect` (LG) / Tizen Studio Web Inspector (Samsung).
