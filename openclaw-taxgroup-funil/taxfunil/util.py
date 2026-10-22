"""Formatação (padrão brasileiro), cores da marca e normalização de dados de contato."""
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

BRAND = "#274397"
NAVY = "#16295F"
WON = "#1F9D6B"
LOST = "#C7443A"
# Cores das etapas abertas, harmonizadas com o azul Tax Group. A etapa de ganho é sempre verde.
OPEN_COLORS = ["#8A97B1", "#4C8DE6", "#274397", "#7A4FC0", "#E0891E", "#0E9AA7", "#C2417A", "#5D6B8A", "#2F8F5B"]
TEMP = {"Quente": "#E0533D", "Morno": "#E0A21E", "Frio": "#8A97B1"}

FREE_MAIL = {"gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "live.com", "icloud.com",
             "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "msn.com", "proton.me", "protonmail.com",
             "globo.com", "globomail.com", "hotmail.com.br", "outlook.com.br", "me.com"}


def now(tz="America/Sao_Paulo"):
    return datetime.now(ZoneInfo(tz)).replace(tzinfo=None)


def lerp(a, b, t):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def stage_colors(n):
    opens = [OPEN_COLORS[i % len(OPEN_COLORS)] for i in range(max(0, n - 1))]
    return opens + [WON]


def stage_ramp(n):
    return [lerp("#9DB0E2", NAVY, i / max(1, n - 1)) for i in range(n)]


def brl_short(v):
    v = float(v or 0)
    if v >= 1e6:
        return f"{v / 1e6:.2f}".rstrip("0").rstrip(".").replace(".", ",") + " mi"
    if v >= 1e3:
        return f"{v / 1e3:.0f} mil"
    return f"{v:.0f}"


def brl_full(v):
    return f"{float(v or 0):,.0f}".replace(",", ".")


def pct(a, b, casas=1):
    return f"{(100 * a / b if b else 0):.{casas}f}".replace(".", ",") + "%"


def iniciais(nome, n=2):
    partes = [p for p in re.split(r"\s+", (nome or "").strip()) if p and p[0].isalnum()]
    return "".join(p[0] for p in partes[:n]).upper() or "?"


def slug(s):
    s = unicodedata.normalize("NFKD", (s or "").lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def empresa_chave(nome):
    """Chave para reconhecer a mesma empresa escrita de jeitos diferentes."""
    stop = {"ltda", "sa", "s a", "me", "eireli", "epp", "grupo", "cia", "e", "de", "da", "do", "das", "dos"}
    return " ".join(w for w in slug(nome).split() if w not in stop)


def normaliza_telefone(tel):
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    return (tel or "").strip()


def normaliza_email(email):
    email = (email or "").strip().lower()
    return email if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email) else ""


def dominio_do_email(email):
    if "@" not in (email or ""):
        return ""
    d = email.split("@", 1)[1].lower()
    return "" if d in FREE_MAIL else d


def normaliza_dominio(site):
    site = (site or "").strip().lower()
    site = re.sub(r"^https?://", "", site)
    site = re.sub(r"^www\.", "", site)
    return site.split("/")[0]


TEMP_SINONIMOS = {
    "Quente": ["quente", "hot", "muito quente", "bem quente", "fervendo", "a", "alta"],
    "Morno": ["morno", "warm", "medio", "médio", "b", "media", "média", "morna"],
    "Frio": ["frio", "cold", "baixo", "c", "baixa", "fria"],
}


def normaliza_temperatura(t):
    s = slug(t)
    for k, syn in TEMP_SINONIMOS.items():
        if s in (slug(x) for x in syn):
            return k
    for k, syn in TEMP_SINONIMOS.items():
        if any(slug(x) in s.split() for x in syn if len(x) > 2):
            return k
    return ""


def parse_reuniao(txt, ref):
    """Aceita '28/10 10h', '28/10/2026 14:30', '2026-10-28T10:00'. Retorna datetime ou None."""
    if not txt:
        return None
    if isinstance(txt, datetime):
        return txt
    txt = str(txt).strip()
    try:
        return datetime.fromisoformat(txt)
    except ValueError:
        pass
    m = re.search(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?:\D+(\d{1,2})(?:[:h](\d{2}))?)?", txt)
    if not m:
        return None
    d, mo, y, h, mi = m.groups()
    y = int(y) + (2000 if y and len(y) == 2 else 0) if y else ref.year
    try:
        dt = datetime(y, int(mo), int(d), int(h or 9), int(mi or 0))
    except ValueError:
        return None
    if not m.group(3) and dt < ref.replace(hour=0, minute=0):
        dt = dt.replace(year=dt.year + 1)
    return dt


def fmt_periodo(ini, fim):
    return f"{ini.strftime('%d/%m/%Y')} a {fim.strftime('%d/%m/%Y')}"
