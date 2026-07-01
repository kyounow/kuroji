import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { GLOSSARY, GLOSSARY_CATEGORIES, type GlossaryEntry } from '../glossary'
import { useModalA11y } from '../useModalA11y'

interface GlossaryCtx {
  /** 用語集を開く（term を渡すとその項目へスクロール＆強調）。 */
  open: (term?: string) => void
}
const Ctx = createContext<GlossaryCtx>({ open: () => {} })

export function useGlossary(): GlossaryCtx {
  return useContext(Ctx)
}

/** 用語集の状態を持ち、モーダルを描画するプロバイダ。App 全体を包む。 */
export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; focus?: string }>({ open: false })
  const open = useCallback((term?: string) => setState({ open: true, focus: term }), [])
  const close = useCallback(() => setState({ open: false }), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <Ctx.Provider value={value}>
      {children}
      {state.open && <GlossaryModal focusTerm={state.focus} onClose={close} />}
    </Ctx.Provider>
  )
}

/** 会計用語の横に置く小さな ⓘ。タップで用語集を開く（ホバー title に依存しない）。 */
export function InfoTip({ term }: { term: string }) {
  const { open } = useGlossary()
  if (!GLOSSARY[term]) return null // 未登録の語は安全に非表示
  return (
    <button
      type="button"
      className="infotip"
      aria-label={`${term} の説明を見る`}
      title={`${term} とは？`}
      onClick={(e) => {
        e.stopPropagation()
        open(term)
      }}
    >
      ⓘ
    </button>
  )
}

function matches(e: GlossaryEntry, q: string): boolean {
  if (!q) return true
  const hay = `${e.term} ${e.reading ?? ''} ${e.def} ${e.why ?? ''}`.toLowerCase()
  return hay.includes(q.toLowerCase())
}

function GlossaryModal({ focusTerm, onClose }: { focusTerm?: string; onClose: () => void }) {
  const modalRef = useModalA11y<HTMLDivElement>()
  const [q, setQ] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    if (focusTerm) {
      const el = document.getElementById(`gloss-${focusTerm}`)
      el?.scrollIntoView({ block: 'center' })
    }
  }, [focusTerm])
  const query = q.trim()
  const entries = Object.values(GLOSSARY)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal glossary-modal"
        role="dialog"
        aria-modal="true"
        aria-label="会計用語集"
        tabIndex={-1}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>📖 会計 用語集</h2>
          <button className="ghost icon-btn" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="seed-input glossary-search"
          type="search"
          placeholder="用語を検索（例: 売掛金 / ROE / 黒字倒産）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="用語を検索"
        />
        <div className="glossary-body">
          {GLOSSARY_CATEGORIES.map((cat) => {
            const items = entries.filter((e) => e.category === cat.id && matches(e, query))
            if (!items.length) return null
            return (
              <section key={cat.id} className="glossary-cat">
                <h3>{cat.label}</h3>
                {items.map((e) => (
                  <div
                    key={e.term}
                    id={`gloss-${e.term}`}
                    className={`glossary-item ${e.term === focusTerm ? 'focus' : ''}`}
                  >
                    <div className="glossary-term">
                      {e.term}
                      {e.reading && <span className="muted small">（{e.reading}）</span>}
                    </div>
                    <div className="glossary-def">{e.def}</div>
                    {e.why && <div className="glossary-why muted small">💡 {e.why}</div>}
                  </div>
                ))}
              </section>
            )
          })}
          {query && !entries.some((e) => matches(e, query)) && (
            <p className="muted small">「{query}」に一致する用語は見つかりませんでした。</p>
          )}
        </div>
      </div>
    </div>
  )
}
