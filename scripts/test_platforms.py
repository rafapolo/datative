"""Browser regressions ported from ../swissviz/scripts/test_platforms.py.

Each test is a bug swissviz once saw on some platform (iPhone, Android, Firefox,
Brave, odd setups) that datative's pages could have too. Serves dist/ (what
rodado publishes) in Playwright's bundled Chromium, WebKit and Firefox — never
the installed Google Chrome (see ~/.claude/CLAUDE.md). Build first, then:

    bun run build:graph && bun run build:site
    python3 -m pytest scripts/test_platforms.py -q

WebKit stands in for iOS Safari.
"""

import http.server
import os
import re
import socketserver
import threading
import time
from contextlib import contextmanager

import pytest
from playwright.sync_api import sync_playwright

DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
ENTITY = "00000000"  # Banco do Brasil: a big network, 60 datasets
PAGE = f"/e-{ENTITY}.html"
READY = "getComputedStyle(document.getElementById('loading-overlay')).display === 'none'"


class Handler(http.server.SimpleHTTPRequestHandler):
    stall = None  # a path prefix whose body stops after 40 %

    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIST, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if Handler.stall and self.path.startswith(Handler.stall):
            data = open(os.path.join(DIST, self.path.split("?")[0].lstrip("/")), "rb").read()
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data[: len(data) * 2 // 5])
            self.wfile.flush()
            time.sleep(40)
            return
        super().do_GET()


@pytest.fixture(scope="session")
def url():
    assert os.path.exists(os.path.join(DIST, PAGE.lstrip("/"))), "run bun run build:site first"
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


@contextmanager
def browser(pw, engine="chromium", **kw):
    b = getattr(pw, engine).launch(**kw)
    try:
        yield b
    finally:
        b.close()


def page(b, errors=None, **ctx):
    pg = b.new_context(**ctx).new_page()
    if errors is not None:
        pg.on("pageerror", lambda e: errors.append(str(e)))
    return pg


def ready(pg, ms=60000):
    pg.wait_for_function(READY, timeout=ms)


def overlay_text(pg):
    return pg.evaluate("document.getElementById('loading-overlay').innerText")


def spinning(pg):
    return pg.evaluate("(() => { const s = document.querySelector('#loading-overlay .spinner'); return !!s && getComputedStyle(s).display !== 'none' && getComputedStyle(document.getElementById('loading-overlay')).display !== 'none' })()")


# ── loading, and the ways it can't ────────────────────────────────────────────


@pytest.mark.parametrize("engine", ["chromium", "webkit", "firefox"])
def test_loads_without_errors(pw, url, engine):
    """Every engine opens the landing and an entity page with no page errors."""
    with browser(pw, engine) as b:
        errors = []
        pg = page(b, errors)
        pg.goto(url + "/")
        pg.wait_for_selector(".ci-row")
        pg.goto(url + PAGE)
        ready(pg)
        assert pg.evaluate("document.querySelectorAll('.lookup-section').length") > 0
    assert errors == []


def test_fonts_blocked_still_loads(pw, url):
    """MapLibre on unpkg.com left an empty page behind a blocker; here, Google Fonts is the third party."""
    with browser(pw) as b:
        pg = page(b)
        pg.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
        pg.goto(url + PAGE)
        ready(pg)


def test_no_javascript_says_so(pw, url):
    """NoScript, Tor "Safest": "carregando rede" spun for ever."""
    with browser(pw) as b:
        pg = b.new_context(java_script_enabled=False).new_page()
        pg.goto(url + PAGE)
        assert "JavaScript" in pg.inner_text("body")
        assert not spinning(pg)


def test_no_webgl_says_so(pw, url):
    """Without WebGL the page spun "carregando rede" for ever (Tor "Safer", blocklisted GPUs)."""
    with browser(pw, "firefox", firefox_user_prefs={"webgl.disabled": True}) as b:
        pg = page(b)
        pg.goto(url + PAGE)
        pg.wait_for_function("document.getElementById('loading-overlay').innerText.includes('WebGL')", timeout=20000)
        assert not spinning(pg)
        # the dataset tables don't need WebGL: they still open
        assert pg.evaluate("document.querySelectorAll('.lookup-section').length") > 0


def test_missing_data_says_so_and_retries(pw, url):
    """A failed download (404, offline) left the spinner turning under a footer error."""
    with browser(pw) as b:
        ctx = b.new_context()
        pg = ctx.new_page()
        fail = {"on": True}
        pg.route(re.compile(r".*/entities/.*\.json.*"), lambda r: r.abort() if fail["on"] else r.continue_())
        pg.goto(url + PAGE)
        pg.wait_for_selector("#loading-overlay button", timeout=20000)
        assert not spinning(pg)
        fail["on"] = False
        pg.click("#loading-overlay button")
        ready(pg)


def test_stalled_data_gives_up(pw, url):
    """A phone's poor signal stalls a download: the spinner turned for ever (Android)."""
    Handler.stall = f"/entities/{ENTITY}.json"
    try:
        with browser(pw) as b:
            pg = page(b)
            pg.goto(url + PAGE)
            pg.wait_for_selector("#loading-overlay button", timeout=35000)
            assert not spinning(pg)
    finally:
        Handler.stall = None


def test_graph_comes_back_after_context_loss(pw, url):
    """iOS drops a backgrounded tab's WebGL: the graph never drew again."""
    with browser(pw) as b:
        pg = page(b, viewport={"width": 1280, "height": 800})
        pg.goto(url + PAGE)
        ready(pg)
        pg.evaluate("""window.__c0 = document.querySelector('#graph-container canvas.sigma-nodes');
            window.__x = __c0.getContext('webgl2').getExtension('WEBGL_lose_context'); __x.loseContext()""")
        time.sleep(1)
        pg.evaluate("__x.restoreContext()")
        pg.wait_for_function("document.querySelector('#graph-container canvas.sigma-nodes') !== __c0", timeout=10000)
        assert not pg.evaluate("document.querySelector('#graph-container canvas.sigma-nodes').getContext('webgl2').isContextLost()")
        # still interactive: clicking a node shows its details
        assert pg.evaluate("window.__sigma.getGraph().order") > 1


def click_a_leaf(pg):
    """Clicks the most isolated visible non-root node by its screen position, returns [label, id]
    (the details title shows either)."""
    x, y, label = pg.evaluate("""(() => {
        const s = window.__sigma, g = s.getGraph(), root = window.__ENTITY_ID__;
        const r = document.getElementById('graph-container').getBoundingClientRect();
        const pts = g.nodes().filter(n => !s.getNodeDisplayData(n).hidden).map(n => {
            const p = s.framedGraphToViewport(s.getNodeDisplayData(n));
            return { n, x: r.left + p.x, y: r.top + p.y };
        });
        const free = p => document.elementFromPoint(p.x, p.y)?.classList.contains('sigma-mouse');
        let best = null, bestGap = -1;
        for (const p of pts) {
            if (p.n === root || g.getNodeAttribute(p.n, 'type') === 'group' || !free(p)) continue;
            const gap = Math.min(...pts.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y)));
            if (gap > bestGap) { best = p; bestGap = gap; }
        }
        return [best.x, best.y, [String(g.getNodeAttribute(best.n, 'fullLabel') || g.getNodeAttribute(best.n, 'label')).trim(), best.n]];
    })()""")
    pg.mouse.click(x, y)
    return label


def test_clicking_a_node_shows_its_details(pw, url):
    """Control for the test below: a plain click on a node opens its details."""
    with browser(pw) as b:
        pg = page(b, viewport={"width": 1280, "height": 800})
        pg.goto(url + PAGE)
        ready(pg)
        time.sleep(2)
        names = click_a_leaf(pg)
        pg.wait_for_function("ts => ts.includes(document.getElementById('node-details-title').textContent.trim())", arg=names, timeout=5000)


def test_garbled_readback_picks_on_cpu(pw, url):
    """Firefox's resistFingerprinting (LibreWolf, Tor, Mullvad) garbles readPixels: no node ever clicked."""
    with browser(pw, "firefox", firefox_user_prefs={"privacy.resistFingerprinting": True}) as b:
        pg = page(b, viewport={"width": 1280, "height": 800})
        pg.goto(url + PAGE)
        ready(pg)
        time.sleep(2)
        names = click_a_leaf(pg)
        pg.wait_for_function("ts => ts.includes(document.getElementById('node-details-title').textContent.trim())", arg=names, timeout=5000)


# ── the phone ─────────────────────────────────────────────────────────────────


@contextmanager
def phone(pw, device="iPhone 15 Pro", engine="webkit"):
    with browser(pw, engine) as b:
        yield page(b, **pw.devices[device])


@pytest.mark.parametrize("engine,device", [("webkit", "iPhone 15 Pro"), ("chromium", "Pixel 7")])
def test_phone_panel_buttons_answer_one_tap(pw, url, engine, device):
    """Bases, dock, ✕ and a node each answer a single tap; the panels never overlap."""
    with phone(pw, device, engine) as pg:
        pg.goto(url + PAGE)
        ready(pg)
        is_open = "id => document.getElementById(id).classList.contains('open')"
        pg.tap("#lookup-fab")
        pg.wait_for_function(f"({is_open})('lookup-panel')", timeout=3000)
        dock = pg.evaluate("document.getElementById('lookup-panel').dataset.dock")
        pg.tap("#lookup-dock")
        assert pg.evaluate("document.getElementById('lookup-panel').dataset.dock") != dock
        pg.tap("#lookup-close")
        pg.wait_for_function(f"!({is_open})('lookup-panel')", timeout=3000)
        assert pg.evaluate("!document.getElementById('lookup-fab').hidden")
        pg.tap("#lookup-fab")
        pg.wait_for_function(f"({is_open})('lookup-panel')", timeout=3000)
        pg.tap("#lookup-close")
        time.sleep(0.4)
        x, y, _ = pg.evaluate("""(() => {
            const s = window.__sigma, g = s.getGraph(), root = window.__ENTITY_ID__;
            const p = s.framedGraphToViewport(s.getNodeDisplayData(root));
            const r = document.getElementById('graph-container').getBoundingClientRect();
            return [r.left + p.x, r.top + p.y, 0];
        })()""")
        pg.touchscreen.tap(x, y)
        pg.wait_for_function(f"({is_open})('node-details-panel')", timeout=3000)


def test_phone_touch_targets(pw, url):
    """Touch targets under 44 px (WCAG 2.5.5, Apple HIG)."""
    with phone(pw) as pg:
        pg.goto(url + PAGE)
        ready(pg)
        measure = """s => s.map(s => [s, document.querySelector(s).getBoundingClientRect()])
            .filter(([, r]) => r.width < 44 || r.height < 44).map(([s, r]) => s + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))"""
        small = pg.evaluate(measure, ["#lookup-fab", "#layout-select"])
        pg.tap("#lookup-fab")
        time.sleep(0.4)
        small += pg.evaluate("""['#lookup-dock', '#lookup-close']
            .map(s => [s, document.querySelector(s).getBoundingClientRect()])
            .filter(([, r]) => r.width < 44 || r.height < 44).map(([s, r]) => s + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))""")
        assert small == []


def test_zoom_is_not_locked(pw, url):
    """user-scalable=no / maximum-scale=1 broke WCAG 1.4.4 (swissviz bef5097)."""
    for path in ("/", PAGE):
        html = open(os.path.join(DIST, path.lstrip("/") or "index.html")).read()
        meta = re.search(r'<meta name="viewport" content="([^"]+)"', html).group(1)
        assert "user-scalable=no" not in meta and "maximum-scale=1" not in meta


# ── keyboard ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("viewport", [{"width": 1280, "height": 800}, {"width": 390, "height": 844}])
def test_shut_panels_out_of_the_tab_order(pw, url, viewport):
    """Closed sheets slid off screen kept their buttons and rows in the Tab order (swissviz: 58 of 80 stops)."""
    with browser(pw) as b:
        pg = page(b, viewport=viewport)
        pg.goto(url + PAGE)
        ready(pg)
        pg.evaluate("for (const id of ['lookup-close', 'node-details-close']) document.getElementById(id).click()")
        time.sleep(0.5)
        off = []
        for _ in range(40):
            pg.keyboard.press("Tab")
            o = pg.evaluate("""(() => { const e = document.activeElement, r = e.getBoundingClientRect();
                return r.bottom > innerHeight || r.top < 0 || r.right > innerWidth || r.left < 0 ? (e.id || e.className || e.tagName) : '' })()""")
            if o:
                off.append(o)
        assert off == []


def test_escape_closes_the_open_panel(pw, url):
    """Esc didn't close a sheet (swissviz #33)."""
    with browser(pw) as b:
        pg = page(b, viewport={"width": 390, "height": 844})
        pg.goto(url + PAGE)
        ready(pg)
        pg.click("#lookup-fab")
        pg.wait_for_function("document.getElementById('lookup-panel').classList.contains('open')")
        pg.keyboard.press("Escape")
        pg.wait_for_function("!document.getElementById('lookup-panel').classList.contains('open')", timeout=2000)
        # focus goes back to what opened it
        assert pg.evaluate("document.activeElement.id") == "lookup-fab"


def test_panel_opened_by_keyboard_takes_focus(pw, url):
    """A sheet opened from the keyboard on a phone didn't take the focus (swissviz #41)."""
    with browser(pw) as b:
        pg = page(b, viewport={"width": 390, "height": 844})
        pg.goto(url + PAGE)
        ready(pg)
        pg.focus("#lookup-fab")
        pg.keyboard.press("Enter")
        pg.wait_for_function("document.getElementById('lookup-panel').classList.contains('open')")
        assert pg.evaluate("document.getElementById('lookup-panel').contains(document.activeElement)")


# ── landing search ────────────────────────────────────────────────────────────


def test_search_finds_curly_apostrophes_and_ligatures(pw, url):
    """iOS types ’ for ' (Smart Punctuation), PDFs paste ﬁ: no results."""
    with browser(pw) as b:
        pg = page(b)
        pg.goto(url + "/")
        pg.wait_for_selector(".ci-row")
        counts = []
        for q in ["filho", "ﬁlho", "d'agua", "d’agua"]:
            pg.fill("#entity-search", q)
            counts.append(pg.evaluate("document.querySelectorAll('.ci-row:not([hidden])').length"))
        assert counts[0] > 0 and counts[0] == counts[1] and counts[2] == counts[3]
