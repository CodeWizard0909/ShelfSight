import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { fetchEvidence } from '../lib/useScan'

export default function EvidenceModal({ task, keyword, cfg, onClose }) {
  const [ev, setEv] = useState(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!task) return
    setEv(null)
    fetchEvidence(task, keyword).then((d) => {
      const shots = d?.steps.filter((s) => s.url) || []
      setEv(d && { ...d, shots })
      setI(Math.max(0, shots.length - 1))
    })
  }, [task, keyword])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (!ev) return
      if (e.key === 'ArrowRight') setI((x) => Math.min(ev.shots.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ev, onClose])

  const [p, z] = task ? task.split(':') : []
  const shot = ev?.shots[i]

  return (
    <AnimatePresence>
      {task && (
        <motion.div className="fixed inset-0 z-[2000] grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div onClick={(e) => e.stopPropagation()} className="grid max-h-[94vh] w-full max-w-6xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-2xl bg-card shadow-2xl"
            initial={{ y: 24, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-ink-3">Proof · what the TinyFish agent saw</div>
                <div className="font-serif text-3xl leading-tight">
                  <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: `var(--color-${p})` }} />
                  {cfg.platforms[p].name}, {cfg.pincodes[z].area} <span className="text-ink-3">{z}</span>
                </div>
                {ev && <div className="mt-1 font-mono text-xs text-ink-2">{ev.num_of_steps} steps · run {ev.run_id.slice(0, 8)} · {new Date(ev.finished_at).toLocaleString()}</div>}
              </div>
              <button onClick={onClose} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-paper">Close</button>
            </div>

            <div className="relative grid min-h-0 place-items-center overflow-auto bg-[#111]">
              {!ev && <div className="p-20 text-sm text-white/60">Loading screenshots…</div>}
              {ev && !shot && <div className="p-20 text-sm text-white/60">No screenshots recorded for this run.</div>}
              {shot && (
                <>
                  <img src={shot.url} alt={shot.action} className="block max-h-[62vh] max-w-full" />
                  <div className="absolute bottom-3 left-3 rounded-lg bg-black/75 px-3 py-1.5 font-mono text-xs text-white">
                    Step {i + 1}/{ev.shots.length} · {shot.action}
                  </div>
                </>
              )}
            </div>

            {ev?.shots.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-t border-line p-3">
                {ev.shots.map((s, k) => (
                  <button key={k} onClick={() => setI(k)} className={`w-36 shrink-0 text-left transition ${k === i ? 'opacity-100' : 'opacity-55 hover:opacity-100'}`}>
                    <img src={s.url} alt="" loading="lazy" className={`h-20 w-36 rounded-md object-cover object-top ring-2 ${k === i ? 'ring-ink' : 'ring-transparent'}`} />
                    <div className="mt-1 truncate text-[10px] text-ink-2">{k + 1}. {s.action}</div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
