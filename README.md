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
- **Puni ekran** — OSD s EPG-om; GORE/DOLJE i CH± mijenjaju kanal; BACK izlazi.
- **Catch-up / filmovi / epizode** — LIJEVO/DESNO premotavanje (30 s / 1 min, držanje ubrzava),
  REW/FF veliki korak, OK prikazuje kontrole, PLAY/PAUSE pauza. Nastavak gledanja od zadnje pozicije.
- **Movies / Series** — kategorije + grid postera, sortiranje, info ekran (opis, ocjena, trailer, favorit),
  sezone i epizode, automatski sljedeća epizoda.
- **Search** — u trenutnoj sekciji; s Home/Settings bira se Live / Movies / Series.
- **Settings** — jezik, format vremena, network test, format streama (TS / HLS), player engine (Samsung),
  sortiranje kanala, skrivanje kategorija, roditeljski PIN (zadano `0000`).
- **Playlists** i **Account** (MAC, stanje pretplate, istek, QR kod za aktivaciju / dodavanje playliste).
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
js/nav.js             fokus i tipke (slojevi + zone)
js/widgets.js         virtualna lista, virtualni grid, red kartica, grupa gumba
js/dialogs.js         dijalozi (izbor, višestruki izbor, PIN, potvrda)
js/player.js          AVPlay / HTML5 engine + kontroler
js/screens/*.js       gate (aktivacija/greške), shell (traka+kategorije), home, grid, live,
                      fullscreen (OSD), info (film/serija), settings, search
```

## Razvoj u pregledniku

Otvori `index.html` preko lokalnog web servera (npr. `npx http-server .`) u Chromeu s prozorom
1920x1080. Tipke: strelice, Enter = OK, Backspace/Esc = BACK, Alt+R/G/Y/B = boje, PageUp/PageDown = CH±.
U pregledniku se koristi HTML5 player i nasumični ID uređaja (spremljen u localStorage).

## Pakiranje

**LG:** `ares-package ./` → `ares-install --device <tv> iptvlbbe.lg_3.0.0_all.ipk` → `ares-launch --device <tv> iptvlbbe.lg`
(debug: `ares-inspect --device <tv> --app iptvlbbe.lg`).

**Samsung:** Tizen Studio → Build Signed Package (certifikat autora + distributora), ili
`tizen package -t wgt -s <profil> -- .` pa `tizen install -n IPTVLBBEPLAYER.wgt -t <tv>`.

## Kompatibilnost

Kod je ES5 i CSS bez varijabli / `gap` / grida, da radi i na starijim TV-ima (Tizen 3+, webOS 3+).
Ne uvoditi ES6 sintaksu (arrow funkcije, `let/const`, template stringove, klase) ni moderne CSS značajke
bez provjere na najstarijem podržanom TV-u. Pravila za rad su u `AGENTS.md`.
