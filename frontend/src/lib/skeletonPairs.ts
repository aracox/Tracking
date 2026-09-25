import type { SkeletonConfig } from '../types'

/** Resolves `config/skeleton.json` marker-name connections to index pairs into
 *  `markers`, trimming whitespace (source marker names can carry it) and dropping
 *  connections whose markers aren't present in this session. */
export function resolveSkeletonPairs(markers: string[], skeleton: SkeletonConfig): [number, number][] {
  const idx = new Map(markers.map((n, i) => [n.trim(), i]))
  const out: [number, number][] = []
  for (const [a, b] of skeleton.connections) {
    const i = idx.get(a.trim())
    const j = idx.get(b.trim())
    if (i !== undefined && j !== undefined) out.push([i, j])
  }
  return out
}
