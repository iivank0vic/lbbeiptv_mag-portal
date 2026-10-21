# IPTV LBBE Player — LG webOS, Samsung Tizen i MAG portal

TV verzija LBBE IPTV playera. Izgled, sekcije, navigacija daljinskim i ponašanje su isti kao u
Android aplikaciji (`lbbeiptv_android-app`, specifikacija u `APP.md`).

**Isti kod za sve platforme.** Repozitoriji `lbbeiptv_lgtv-app`, `lbbeiptv_samsung-app` i
`lbbeiptv_mag-portal` imaju identične datoteke; razlikuju se samo:

| | LG webOS | Samsung Tizen | MAG portal |
|---|---|---|---|
| Platforma | `js/platform.js` (LG) | `js/platform.js` (Samsung) | `js/platform.js` (MAG) |
| Manifest | `appinfo.json`, `icon.png` | `config.xml`, `ic_launcher_foreground.png` | – (web portal, `mag/build.sh`) |
| SDK skripta u `index.html` | `webOSTVjs-1.2.0/webOSTV.js` | `$WEBAPIS/webapis/webapis.js` | `mag/polyfills.js` |
| Player | HTML5 `<video>` | Samsung AVPlay (rezerva: HTML5) | MAG `gSTB` player |
| ID uređaja | LGUDID → MAC oblik (kao do sada) | MAC (Ethernet → Wi-Fi → webapis) | MAC + serijski broj + token uređaja |
| Backend | `app-api-v4…/tv_lg` | `app-api-v4…/tv_samsung` | `app-api-v4…/tv_mag` (preko nginx `/portal/api/`) |

Promjenu u zajedničkom kodu napravi u jednom repozitoriju i prenesi u ostale:
`tools/sync.sh ../lbbeiptv_samsung-app` i `tools/sync.sh ../lbbeiptv_mag-portal`. Skripta ne dira
`js/platform.js`, manifeste ni `mag/`. MAG detalji (backend, nginx, deploy) su u `MAG.md` MAG repozitorija.

## Što aplikacija radi

- **Home** — "Continue watching" (zadnji kanal) + pločice Live TV / Movies / Series s brojem stavki,
  redovi: najnoviji filmovi, najnovije serije, omiljeni kanali.
- **Live TV** — traka | kategorije | kanali | pregled + EPG. OK = pregled, OK na kanal koji svira = puni ekran.
  DESNO na kanalu sa sat ikonom = catch-up (arhiva). Žuta = favorit, crvena/MENU = opcije, brojevi = skok na kanal.
- **Playliste** — Xtream Codes (`get.php?username=&password=`), XUI ONE (`/playlist/<user>/<pass>/m3u_plus`, preko
  `player_api.php`) i M3U (`tvg-type` live / movie / series, serije iz `S01E02` u imenu, EPG iz XMLTV `url-tvg`).
  Ako API ne radi, link se skida kao M3U.
- **Učitavanje** — koraci s napretkom (Xtream 7 koraka, M3U s MB / MB/s), nakon 15 s "Taking too long? Options";
  greške s jasnim razlogom i akcijama (Retry, Continue with saved data, Clear cache, Choose playlist, More options).
  Kopija zadnje playliste u IndexedDB-u (ne u MAG lite načinu).
- **Puni ekran** — OSD s EPG-om; GORE/DOLJE i CH± mijenjaju kanal; BACK izlazi.
  Prekid streama: 3 automatska ponovna spajanja (1 / 2 / 4 s, "Reconnecting… (n/3)"), tek onda poruka.
- **Slika** — Fill screen (zadano: popuni ekran, reže najviše 5 % po rubu), Fit, Zoom, Stretch, 16:9, 4:3;
  pamti se (Settings → Aspect ratio ili tipka u OSD-u), toast "Picture: …". AVPlay: Fit/Auto/Stretch/16:9/4:3; MAG svoje.
- **Catch-up** — LIJEVO/DESNO premotavanje (držanje ubrzava), REW/FF veliki korak, OK kontrole.
- **Filmovi / epizode (OSD kao Android 2.2.6)** — gore naslov + podnaslov + sat; traka napretka (fokusabilna,
  LIJEVO/DESNO ±1 %) s proteklim i preostalim vremenom; lijevo audio/titlovi, sredina prethodna / −30 s /
  play / +30 s / sljedeća, desno slika + info (film) ili red epizoda sezone (serija). Nastavak od zadnje pozicije.
- **Movies / Series** — kategorije + grid postera, sortiranje, info ekran (opis, ocjena, trailer, favorit),
  sezone i epizode, automatski sljedeća epizoda.
- **Search** — u trenutnoj sekciji; s Home/Settings bira se Live / Movies / Series.
- **Settings** — jezik, format vremena, network test, format streama (TS / HLS), player engine (Samsung),
  sortiranje kanala, skrivanje kategorija, roditeljski PIN (zadano `0000`).
- **Playlists** i **Account** (MAC, stanje pretplate, istek + "N days left", QR kod za aktivaciju / dodavanje playliste).
- **Aktivacija** — ekrani s oznakom (trial / ističe / isteklo / bez playliste / pairing), trial i "ističe"
  nastavljaju sami nakon 8 s. Pairing (API-SECURITY): 403 `pairing_required` → kod + QR `mylist?mac=&code=`;
  tajni ključ uređaja (`X-Device-Key`) šalje se uz svaki poziv portala.
- Plava tipka / MENU kruži Live → Movies → Series. BACK ide korak po korak do dijaloga za izlaz.

## Struktura

```
index.html            jedini HTML; ekrani se crtaju iz JS-a
css/app.css           dizajn sustav (tokeni kao Android ui_*), 1920x1080
fonts/                Anek Telugu (lokalno — TV često nema mrežu pri pokretanju)
images/logo.png
js/platform.js        JEDINA datoteka specifična za platformu
js/util.js            HTTP (XHR), pohrana, formatiranje
js/i18n.js            prijevodi sa servera + engleski fallback
js/api.js             backend (playlist_information) i Xtream API
js/library.js         postavke, učitavanje playliste (Xtream / M3U), favoriti, recent, nastavak
js/cache.js           kopija playliste i EPG-a u IndexedDB-u ("Continue with saved data")
js/epg.js             EPG za M3U (XMLTV, .gz preko js/lib/pako_inflate.min.js)
js/nav.js             fokus i tipke (slojevi + zone)
js/widgets.js         virtualna lista, virtualni grid, red kartica, grupa gumba
js/dialogs.js         dijalozi (izbor, višestruki izbor, PIN, potvrda)
js/player.js          AVPlay / HTML5 engine + kontroler
js/screens/*.js       gate (loader s koracima, aktivacija/pairing), shell (traka+kategorije), home, grid, live,
                      fullscreen (OSD), info (film/serija), settings, search
```

## Razvoj u pregledniku

Otvori `index.html` preko lokalnog web servera (npr. `npx http-server .`) u Chromeu s prozorom
1920x1080. Tipke: strelice, Enter = OK, Backspace/Esc = BACK, Alt+R/G/Y/B = boje, PageUp/PageDown = CH±.
U pregledniku se koristi HTML5 player i nasumični ID uređaja (spremljen u localStorage).

## Pakiranje

**LG:** `ares-package ./` → `ares-install --device <tv> iptvlbbe.lg_3.1.0_all.ipk` → `ares-launch --device <tv> iptvlbbe.lg`
(debug: `ares-inspect --device <tv> --app iptvlbbe.lg`).

**Samsung:** Tizen Studio → Build Signed Package (certifikat autora + distributora), ili
`tizen package -t wgt -s <profil> -- .` pa `tizen install -n IPTVLBBEPLAYER.wgt -t <tv>`.

## Kompatibilnost

Kod je ES5 i CSS bez varijabli / `gap` / grida, da radi i na starijim TV-ima (Tizen 3+, webOS 3+).
Ne uvoditi ES6 sintaksu (arrow funkcije, `let/const`, template stringove, klase) ni moderne CSS značajke
bez provjere na najstarijem podržanom TV-u. Pravila za rad su u `AGENTS.md`.
