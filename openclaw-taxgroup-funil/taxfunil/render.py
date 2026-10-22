"""HTML (Jinja2) → PDF A4 paisagem via Chromium, com checagem automática de layout quebrado."""
import base64
import os
import shutil
import subprocess
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .config import BASE_DIR

TEMPLATES = BASE_DIR / "templates"
ASSETS = BASE_DIR / "assets"

# Conta elementos cujo conteúdo passa da borda (altura ou largura): cards, páginas e rodapés de card.
OVERFLOW_JS = """() => {
  const bad = [...document.querySelectorAll('.page,.cd')]
    .filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
  bad.push(...[...document.querySelectorAll('.cd .ft')].filter(e => e.scrollWidth > e.clientWidth + 1));
  return bad.map(e => (e.closest('.page') ? [...document.querySelectorAll('.page')].indexOf(e.closest('.page')) + 1 : 0));
}"""

_env = Environment(loader=FileSystemLoader(str(TEMPLATES)), autoescape=select_autoescape(["html"]))


def _data_uri(path):
    mime = "image/png" if str(path).endswith(".png") else "image/svg+xml"
    return f"data:{mime};base64," + base64.b64encode(Path(path).read_bytes()).decode()


def common_context(cfg):
    return dict(
        fonts_dir=(ASSETS / "fonts").as_uri(),
        logo_w=_data_uri(ASSETS / "logo_branco.png"),
        logo_t=_data_uri(ASSETS / "logo_azul.png"),
        marca=cfg["marca"],
    )


def render_html(template, out_html, **ctx):
    html = _env.get_template(template).render(**ctx)
    Path(out_html).write_text(html, encoding="utf-8")
    return out_html


def _chrome_path():
    env = os.environ.get("TAXFUNIL_CHROME")
    if env:
        return env
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    return None


def html_to_pdf(html_path, pdf_path):
    """Gera o PDF. Retorna a lista de páginas com conteúdo estourando a borda (vazia = layout ok)."""
    url = Path(html_path).resolve().as_uri()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sync_playwright = None
    if sync_playwright:
        with sync_playwright() as p:
            kw = {"executable_path": os.environ["TAXFUNIL_CHROME"]} if os.environ.get("TAXFUNIL_CHROME") else {}
            browser = p.chromium.launch(args=["--no-sandbox", "--allow-file-access-from-files"], **kw)
            page = browser.new_page(viewport={"width": 1123, "height": 794})
            page.goto(url, wait_until="load")
            page.evaluate("document.fonts.ready")
            problemas = page.evaluate(OVERFLOW_JS)
            page.pdf(path=str(pdf_path), prefer_css_page_size=True, print_background=True)
            browser.close()
        return sorted(set(problemas))
    chrome = _chrome_path()
    if not chrome:
        raise RuntimeError("Chromium não encontrado. Instale com: pip install playwright && playwright install chromium")
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                    "--virtual-time-budget=10000", "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", url],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
    return []


def build_pdf(cfg, template, out_pdf, keep_html=False, **ctx):
    out_pdf = Path(out_pdf)
    out_html = out_pdf.with_suffix(".html")
    render_html(template, out_html, **common_context(cfg), **ctx)
    problemas = html_to_pdf(out_html, out_pdf)
    if not keep_html:
        out_html.unlink(missing_ok=True)
    return {"arquivo": str(out_pdf), "paginas": ctx.get("total"), "layout_ok": not problemas,
            "paginas_com_problema": problemas}
