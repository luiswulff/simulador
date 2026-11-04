/**
 * Avaliador seguro de fórmulas de indicadores (sem eval).
 * Suporta: números, códigos de indicadores, + - * / e parênteses.
 * Ex.: "rol / receita_global * 100", "novas_unidades * contratos_por_unidade"
 * Se qualquer código referenciado não tiver valor, o resultado é null.
 */
type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenizar(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:[.,]\d+)?)|([a-z_][a-z0-9_]*)|([-+*/()]))/giy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < src.length && (m = re.exec(src))) {
    if (m[1]) out.push({ t: 'num', v: Number(m[1].replace(',', '.')) });
    else if (m[2]) out.push({ t: 'id', v: m[2].toLowerCase() });
    else if (m[3]) out.push({ t: 'op', v: m[3] });
    pos = re.lastIndex;
  }
  if (src.slice(pos).trim()) throw new Error(`Fórmula inválida perto de "${src.slice(pos).trim()}"`);
  return out;
}

export function referencias(formula: string): string[] {
  try {
    return [...new Set(tokenizar(formula).filter((t) => t.t === 'id').map((t) => t.v as string))];
  } catch {
    return [];
  }
}

export function avaliar(formula: string, valor: (codigo: string) => number | null | undefined): number | null {
  const toks = tokenizar(formula);
  let i = 0;
  let faltou = false;
  const espiar = () => toks[i];
  const fator = (): number => {
    const t = toks[i++];
    if (!t) throw new Error('Fórmula incompleta');
    if (t.t === 'num') return t.v;
    if (t.t === 'id') { const v = valor(t.v); if (v === null || v === undefined) { faltou = true; return 0; } return v; }
    if (t.v === '-') return -fator();
    if (t.v === '(') { const v = soma(); if (toks[i++]?.v !== ')') throw new Error('Parêntese não fechado'); return v; }
    throw new Error(`Token inesperado "${t.v}"`);
  };
  const produto = (): number => {
    let v = fator();
    while (espiar()?.t === 'op' && (espiar().v === '*' || espiar().v === '/')) {
      const op = toks[i++].v; const d = fator();
      if (op === '/' && d === 0) { faltou = true; v = 0; } else v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  const soma = (): number => {
    let v = produto();
    while (espiar()?.t === 'op' && (espiar().v === '+' || espiar().v === '-')) {
      const op = toks[i++].v; const d = produto();
      v = op === '+' ? v + d : v - d;
    }
    return v;
  };
  const r = soma();
  if (i < toks.length) throw new Error('Fórmula com sobra de termos');
  return faltou ? null : r;
}
