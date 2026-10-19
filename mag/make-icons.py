# PNG ikone za stari MAG WebKit (ne zna SVG ni inline ni kao sliku).
# Pokreni nakon promjene js/icons.js:  python3 mag/make-icons.py . mag/icons   (treba playwright + chromium)
import asyncio, base64, sys, os
from playwright.async_api import async_playwright
P, OUT = sys.argv[1], sys.argv[2]
COLORS = {'w': '#F2F5F7', 'star': '#F5C542', 'catch': '#9AA7B2', 'past': '#2FA4F0'}
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); p = await b.new_page()
        await p.set_content('<html><body></body></html>')
        await p.add_script_tag(content='var App={};' )
        await p.add_script_tag(path=P + '/js/icons.js')
        res = await p.evaluate("""(colors)=>{var out={}; for (var n in App.ICONS){ for (var k in colors){ var c=document.createElement('canvas'); c.width=48;c.height=48; var x=c.getContext('2d'); x.scale(2,2); x.fillStyle=colors[k]; x.fill(new Path2D(App.ICONS[n])); out[n+'-'+k]=c.toDataURL('image/png'); } } return out;}""", COLORS)
        for name, url in res.items():
            open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
        print(len(res), 'ikona')
        await b.close()
asyncio.run(main())
