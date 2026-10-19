# MAG portal — LBBE IPTV Player na Infomir MAG boxovima

Isti player kao LG / Samsung aplikacija (zajednički kod, vidi `README.md` i `AGENTS.md`), zapakiran kao
**web portal** koji MAG učita s Portal URL-a. Samo `js/platform.js`, `mag/` i jedna linija u `index.html`
su MAG-specifični.

## Zašto ne Stalker / `portal.php`

Klasični XUI MAG portal (`load.php` → `portal.php`) prepoznaje box **samo po MAC adresi**. MAG MAC-ovi
počinju s `00:1A:79`, pa skeneri lako pogode aktivne MAC-ove i dobiju liniju.

Ovaj portal radi drugačije:

1. Box se backendu (`app-api-v4…/tv_mag`) javlja s **MAC + serijski broj + token uređaja**.
   Token je nasumičan (128 bit), nastaje pri prvom pokretanju i ostaje spremljen na boxu
   (`gSTB.SaveUserData` + `localStorage`).
2. Neaktiviran box na ekranu prikazuje MAC i **kod za aktivaciju** (6 znakova, izveden iz tokena).
   Kod nije nigdje drugdje vidljiv (uz `MAG_REQUIRE_CODE` aktivacija na webu traži MAC **i** kod).
3. Nakon aktivacije backend MAC veže uz serijski broj i token. Zahtjev s istim MAC-om, a drugim
   tokenom ili serijskim brojem (skener), dobiva odgovor kao za neregistriran uređaj.
4. Streamovi idu preko običnog Xtream `username/password` iz playliste, ne preko XUI MAG uređaja.
   Zato nginx više ne mora izlagati `portal.php` / `load.php`.

## Backend (`lbbeiptv_api-v4-app` → `api_mag.php`)

```
GET /tv_mag/playlist_information/<MAC>?sn=<serijski>&dt=<token>&pc=<kod>&model=<model>
```

| Param | Opis |
|---|---|
| `MAC` | `00:1A:79:XX:XX:XX` |
| `sn` | serijski broj boxa (`gSTB.GetDeviceSerialNumber()`), može biti prazan na starom firmwareu |
| `dt` | token uređaja, 32 hex znaka |
| `pc` | kod za aktivaciju koji box upravo prikazuje (6 znakova, `A-Z` bez `I`/`O` + `2-9`) |
| `model` | npr. `MAG254`, samo informativno |

Tablica `mag_devices` (napravi se sama pri prvom zahtjevu):

- **Prvi box** koji se javi za MAC zapisuje se kao `pending`. Drugi token za isti MAC dobiva odgovor
  bez playliste, osim ako se pending nije javio `MAG_PENDING_DAYS` dana (default 7), npr. nakon
  tvorničkog reseta.
- Prvi ispravan zahtjev upiše MAC u `play_lists` (`app_type = mag`, 14 dana probno, kao LG), pa se box
  vidi u ACP-u i može mu se dodati lista. Box se time **veže**: MAC + token (+ serijski).
- **Vezan MAC** s drugim tokenom ili serijskim brojem (skener) dobiva `mac_registered: false` bez `urls`.
- **Reset** (novi box za isti MAC): `DELETE FROM mag_devices WHERE mac_address = '00:1A:79:...'`.
- **Strože (preporučeno):** `define('MAG_REQUIRE_CODE', true);` u `config.php`. Box se tada veže tek kad
  aktivacijska stranica (`/activate?mac=…&code=…`) potvrdi kod:
  `UPDATE mag_devices SET code_verified = 1 WHERE mac_address = ? AND pair_code = ? AND status = 'pending'`.
  Bez toga (default) vrijedi "prvi box koji se javio".

## Proxy do backenda

Portal zove `api/?r=/playlist_information/<MAC>&sn=…` na **istom hostu** (MAG 250/254 nema CORS ni moderan
TLS problem). Dvije izvedbe, obje rade bez dodatne konfiguracije:

- **Bilo koji PHP server (FTP deploy):** `api/index.php` prosljeđuje na
  `https://app-api-v4.lbbeiptv.com/tv_mag` (treba curl ili `allow_url_fopen`). Propušta samo
  `playlist_information` / `get_app_setting` s MAC adresom.
- **xui-nginx:** `conf/snippets/xu-mag-portal.conf` — `/portal/api/` ide direktno proxyjem na backend;
  `portal.php`, `/server/load.php` i `/stalker_portal/*` su ugašeni (404).

## Build i deploy

```bash
mag/build.sh                                   # -> dist/
mag/build.sh /home/xtreamcodes/iptv_xtream_codes/zMagPortal/portal   # build + deploy (lokalno)
mag/build.sh root@server:/opt/xui/iptv_xtream_codes/zMagPortal/portal  # build + deploy (ssh)
```

Build samo kopira datoteke u `dist/` i dodaje `?v=` (MAG kešira portal) — `-webkit-` prefiksi za stare
MAG-ove su već u `css/app.css`. Zato se može i bez builda: uploadaj `index.html`, `icon.png`, `api/`,
`css/`, `fonts/`, `images/`, `js/` i `mag/polyfills.js` na bilo koji PHP server (to radi i
`.github/workflows/deploy.yml` na svaki push).

## Postavljanje na boxu

SET → System Settings → Servers → Portals → Portal 1 URL:

```
http://<domena>:<port>/portal/
```

Preko Cloudflarea port mora biti jedan od CF HTTP portova (80, 8080, 8880, 2052, 2082, 2086, 2095).
Za MAG domenu na CF-u isključi Bot Fight Mode / Browser Integrity Check i Rocket Loader, a
`/portal/api/*`, `/live/*`, `/movie/*`, `/series/*` stavi na *Bypass cache*.

## Razvoj u pregledniku

`npx http-server .` pa `http://localhost:8080/?api=https://app-api-v4.lbbeiptv.com/tv_mag`
(Chrome, prozor 1920x1080). Bez `gSTB` koristi se HTML5 player i nasumični MAC.

## MAG specifičnosti (`js/platform.js`)

- **Player:** `gSTB.Play('auto '|'ffmpeg ' + url)`, događaji kroz `window.stbEvent.onEvent`
  (4 = počelo, 1 = kraj, 5/8 = greška). Pregled = `SetViewport`, puni ekran = `SetPIG(1,-1,-1,-1)`.
- **Prozirnost:** video je ispod web sloja (`SetTopWin(0)`), kao AVPlay na Samsungu.
- **Rezolucija:** aplikacija je 1920x1080; na grafici 1280x720 skalira se CSS `zoom`-om. Faktor za
  viewport videa se mjeri (`rectScale`), jer preglednici različito vraćaju koordinate uz `zoom`.
- **Tipke:** keyCode + 1000 (Shift) + 2000 (Alt), kao Infomir SDK. Glasnoću, mute i power rješava portal.
- **Izlaz:** `file:///home/web/services.html` (ugrađeni MAG izbornik).

## Što još treba provjeriti na pravom boxu

Napisano prema Infomir stbapi-ju, ali **nije testirano na MAG-u**. Prvo provjeriti na 254/256 i 322/324:
kodove tipki (posebno CH±, INFO, PLAY), `SetViewport` koordinate na 720p grafici, prozirnost pregleda,
izlaz u izbornik i rad velikih playlista na MAG 250 (malo RAM-a).
