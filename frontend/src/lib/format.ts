export const fmt = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '—')
