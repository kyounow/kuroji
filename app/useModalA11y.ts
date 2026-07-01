import { useEffect, useRef } from 'react'

/**
 * モーダルのアクセシビリティ: 開いたら中へ初期フォーカス、Tab をモーダル内に閉じ込め（フォーカストラップ）、
 * 閉じたら開く前の要素へフォーカスを戻す。返り値の ref をモーダル本体（aria-label と tabIndex={-1} を持つ要素）に付ける。
 */
export function useModalA11y<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const prevFocus = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
    // 初期フォーカスはモーダル本体（aria-label が読み上げられる）。
    node.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        node.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      prevFocus?.focus?.()
    }
  }, [])
  return ref
}
