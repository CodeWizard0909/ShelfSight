import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfig, useElapsed, useScan } from './lib/useScan'
import { hasShelf, verdict } from './lib/verdict'
import ShelfMap from './components/ShelfMap'
import EvidenceModal from './components/EvidenceModal'
import { Alerts, EvidenceStrip, Matrix, PlatformCards, Swarm, TopBar, Verdict } from './components/Panels'

const MANUAL_MIN_PER_CHECK = 4 // open app, set pincode, search, note it down

export default function App() {
  const cfg = useConfig()
  const [state, start] = useScan()
  const elapsed = useElapsed(state)
  const [form, setForm] = useState({
    brand: 'Yoga Bar',
    keyword: 'yoga bar protein bar',
    mode: 'auto',
    platforms: ['blinkit', 'zepto', 'instamart', 'bigbasket'],
    pincodes: ['560102', '560034', '560038', '560066', '560103', '560011'],
  })
  const [cached, setCached] = useState(new Set())
  const [proof, setProof] = useState(null)
  const [watching, setWatching] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    fetch(`/api/cached?keyword=${encodeURIComponent(form.keyword)}`).then((r) => r.json()).then((l) => setCached(new Set(l)))
    fetch('/api/wallet').then((r) => (r.ok ? r.json() : null)).then(setWallet).catch(() => {})
  }, [form.keyword, state.status])

  const liveCount = form.mode === 'replay' ? 0 : form.pincodes.reduce((n, z) =>
    n + form.platforms.filter((p) => form.mode === 'live' || !cached.has(`${p}:${z}`)).length, 0)

  const deploy = async () => {
    if (!form.platforms.length || !form.pincodes.length) return
    setNotice(null)
    const err = await start(form)
    if (err) setNotice(err)
  }

  // Keep the live panel on a running agent
  useEffect(() => {
    if (watching && state.tasks[watching]?.phase === 'running') return
    const next = state.order.find((t) => state.tasks[t]?.phase === 'running' && state.tasks[t]?.preview)
    if (next !== watching) setWatching(next || null)
  }, [state, watching])

  const cells = useMemo(() => Object.values(state.cells), [state.cells])
  const platforms = state.order.length ? [...new Set(state.order.map((t) => t.split(':')[0]))] : form.platforms
  const v = cfg && verdict(form.brand, cells, cfg)
  const ok = cells.filter(hasShelf)
  const stats = [
    ['Agents', state.order.length || '–'],
    ['Time', state.startedAt ? `${elapsed}s` : '–'],
    ['In stock', ok.length ? `${Math.round((100 * ok.filter((c) => c.status === 'in_stock').length) / ok.length)}%` : '–'],
    ['Manual work saved', ok.length ? `${ok.length * MANUAL_MIN_PER_CHECK}m` : '–'],
  ]

  const share = useCallback(() => {
    const top = state.alerts.filter((a) => a.level !== 'info').slice(0, 8)
    const text = `ShelfSight · ${form.brand}\n${v?.head || ''}\n\n` + top.map((a) => {
      const [p, z] = a.task.split(':')
      return `• ${cfg.platforms[p].name}, ${cfg.pincodes[z].area}: ${a.text}`
    }).join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }, [state.alerts, form.brand, v, cfg])

  const closeProof = useCallback(() => setProof(null), [])

  if (!cfg) return <div className="grid h-screen place-items-center font-serif text-3xl">ShelfSight</div>

  return (
    <>
      <TopBar cfg={cfg} form={form} setForm={setForm} cached={cached} running={state.status === 'running'}
        onDeploy={deploy} liveCount={liveCount} wallet={wallet} />
      <main className="mx-auto max-w-[1400px] px-6 pb-16">
        {notice && <div className="mt-4 rounded-xl border border-oos/40 bg-oos/10 px-4 py-3 text-sm text-oos">{notice}</div>}
        <Verdict v={v} stats={stats} />

        <section className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <ShelfMap cfg={cfg} platforms={platforms} tasks={state.tasks} cells={state.cells} />
          <PlatformCards cfg={cfg} platforms={platforms} cells={cells} keyword={form.keyword} onProof={setProof} />
        </section>

        <EvidenceStrip cfg={cfg} state={state} keyword={form.keyword} onProof={setProof} />

        {state.order.length > 0 && (
          <section className="grid gap-6 py-4 lg:grid-cols-[1fr_440px]">
            <Swarm cfg={cfg} state={state} watching={watching} setWatching={setWatching} onProof={setProof} />
            <Alerts cfg={cfg} alerts={state.alerts} onProof={setProof} onShare={share} />
          </section>
        )}

        <Matrix cfg={cfg} platforms={platforms} state={state} onProof={setProof} />

        <footer className="border-t border-line pt-6 text-xs text-ink-3">
          Built at Swim with TinyFish, Bangalore · Every result comes from a real TinyFish browser agent. Click any result to see its screenshots.
        </footer>
      </main>
      <EvidenceModal task={proof} keyword={form.keyword} cfg={cfg} onClose={closeProof} />
    </>
  )
}
