"""Logo da empresa a partir do domínio, com cache local. Sem logo → None (o card usa monograma)."""
import base64
import io
from concurrent.futures import ThreadPoolExecutor

import requests

from .util import FREE_MAIL

PROVIDERS = {
    "logodev": "https://img.logo.dev/{domain}?token={token}&size=128&format=png&fallback=404",
    "favicon": "https://www.google.com/s2/favicons?domain={domain}&sz=128",
}
MIN_PX = 48   # ícones menores que isso (ex.: globo genérico 16px) são tratados como "sem logo"


class Logos:
    def __init__(self, cfg):
        self.cfg = cfg
        self.provider = cfg["logos"].get("provedor", "favicon")
        self.token = cfg.secret("logodev")
        if self.provider == "logodev" and not self.token:
            self.provider = "favicon"
        self.timeout = cfg["logos"].get("timeout_s", 5)
        self.cache = cfg.path("dados") / "logos"
        self.cache.mkdir(parents=True, exist_ok=True)

    def _fetch(self, domain):
        url = PROVIDERS[self.provider].format(domain=domain, token=self.token)
        r = requests.get(url, timeout=self.timeout)
        if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
            return None
        try:
            from PIL import Image
            w, h = Image.open(io.BytesIO(r.content)).size
            if min(w, h) < MIN_PX:
                return None
        except ImportError:
            if len(r.content) < 1500:
                return None
        except Exception:
            return None
        return r.content

    def get(self, domain):
        domain = (domain or "").lower().strip()
        if not domain or domain in FREE_MAIL or self.provider == "desligado":
            return None
        if self.provider == "demo":
            from .demo import logo_ficticio
            return logo_ficticio(domain)
        png, miss = self.cache / f"{domain}.png", self.cache / f"{domain}.none"
        if png.exists():
            return "data:image/png;base64," + base64.b64encode(png.read_bytes()).decode()
        if miss.exists():
            return None
        try:
            data = self._fetch(domain)
        except requests.RequestException:
            return None          # falha de rede: não grava cache, tenta de novo na próxima
        if data:
            png.write_bytes(data)
            return "data:image/png;base64," + base64.b64encode(data).decode()
        miss.touch()
        return None

    def many(self, domains):
        domains = sorted({d for d in domains if d})
        with ThreadPoolExecutor(max_workers=8) as ex:
            return dict(zip(domains, ex.map(self.get, domains)))
