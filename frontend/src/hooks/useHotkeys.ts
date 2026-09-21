import { useEffect, useRef } from 'react'

export type HotkeyMap = Record<string, () => void>

/** Keys use KeyboardEvent.key, with "Shift+" prefix for shifted arrows. */
export function useHotkeys(map: HotkeyMap): void {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = (e.key.length === 1 ? e.key.toLowerCase() : e.key === ' ' ? 'Space' : e.key)
      const name = (e.shiftKey && e.key.startsWith('Arrow') ? 'Shift+' : '') + (key === ' ' ? 'Space' : key)
      const fn = ref.current[name]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
