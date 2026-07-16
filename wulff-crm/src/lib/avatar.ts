// Avatar de fallback: iniciais + cor estável derivada do nome (Seção 8.3)

const PALETTE = [
  '#1b3b32', '#2c6e5a', '#334155', '#7c2d12', '#713f12',
  '#4c1d95', '#831843', '#164e63', '#3f6212', '#7f1d1d',
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
