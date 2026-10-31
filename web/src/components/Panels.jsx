import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { STATUS, hasShelf, platformStats } from '../lib/verdict'
import { fetchEvidence } from '../lib/useScan'

const Eyebrow = ({ children, right }) => (
  <div className="mb-3 flex items-baseline justify-between gap-3">
    <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-ink-3">{children}</h2>
    {right}
  </div>
)

const PlatformDot = ({ p, size = 8 }) => (
  <i className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: `var(--color-${p})` }} />
)

function useFinalShot(task, keyword) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    if (task) fetchEvidence(task, keyword).then((d) => live && setUrl(d?.steps.filter((s) => s.url).at(-1)?.url || null))
    return () => { live = false }
  }, [task, keyword])
  return url
}

export function TopBar({ cfg, form, setForm, onDeploy, running, cached, liveCount, wallet }) {
  const overLimit = wallet && liveCount > wallet.max_live
  const toggle = (key, v) => setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }))
  const field = 'rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-ink'
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-[1000]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
        <div className="mr-auto">
          <div className="font-serif text-3xl leading-none tracking-tight">Shelf<em>Sight</em></div>
          <div className="mt-1 text-[11px] text-ink-3">Quick-commerce shelf intelligence · agents by TinyFish</div>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onDeploy() }}>
          <input className={`${field} w-32`} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} aria-label="Brand" />
          <input className={`${field} w-52`} value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} aria-label="Search term" />
          <select className={field} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} aria-label="Mode">
            <option value="auto">Recorded + live</option>
            <option value="live">All live</option>
            <option value="replay">Recorded only</option>
          </select>
          <button disabled={running || overLimit} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-black disabled:opacity-40">
            {running ? 'Agents running…' : 'Deploy agents'}
          </button>
          <div className="text-right text-[11px] leading-tight text-ink-3">
            <div className={overLimit ? 'font-semibold text-oos' : ''}>{liveCount} live{overLimit ? ` (max ${wallet.max_live})` : ''} · {form.pincodes.length * form.platforms.length - liveCount} recorded</div>
            {wallet && <div>Wallet ${wallet.balance.toFixed(2)}</div>}
          </div>
        </form>
      </div>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-1.5 px-6 pb-3 text-xs">
        {Object.entries(cfg.platforms).map(([k, p]) => (
          <button key={k} type="button" onClick={() => toggle('platforms', k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${form.platforms.includes(k) ? 'border-ink bg-card text-ink' : 'border-line text-ink-3'}`}>
            <PlatformDot p={k} /> {p.name}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-line" />
        {Object.entries(cfg.pincodes).map(([z, p]) => {
          const n = Object.keys(cfg.platforms).filter((pl) => cached.has(`${pl}:${z}`)).length
          return (
            <button key={z} type="button" onClick={() => toggle('pincodes', z)}
              className={`rounded-full border px-2.5 py-1 transition ${form.pincodes.includes(z) ? 'border-ink bg-card text-ink' : 'border-line text-ink-3'}`}>
              {p.area}{n > 0 && <span className="ml-1 text-ok">●{n}</span>}
            </button>
          )
        })}
      </div>
    </header>
  )
}

export function Verdict({ v, stats }) {
  const tone = { bad: 'text-oos', warn: 'text-nl', good: 'text-ok' }[v?.tone] || 'text-ink-3'
  return (
    <section className="grid gap-6 py-8 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <div className={`mb-3 text-[11px] font-semibold uppercase tracking-[.16em] ${tone}`}>
          {v ? 'Today’s verdict' : 'Ready'}
        </div>
        <AnimatePresence mode="wait">
          <motion.h1 key={v?.head || 'empty'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="max-w-4xl font-serif text-[44px] leading-[1.05] tracking-tight md:text-[56px]">
            {v?.head || 'See your brand the way shoppers see it, on every app, in every pincode.'}
          </motion.h1>
        </AnimatePresence>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">{v?.sub || 'Deploy a swarm of web agents into Blinkit, Zepto, Instamart and BigBasket. Each one sets a delivery location, searches your product, and reports what is really on the shelf.'}</p>
      </div>
      <dl className="grid grid-cols-3 gap-x-8 gap-y-4 lg:grid-cols-2">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-[.12em] text-ink-3">{label}</dt>
            <dd className="font-serif text-4xl tabular-nums leading-none">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function PlatformCard({ p, cfg, cells, keyword, onProof }) {
  const s = platformStats(cells, p)
  const sample = cells.find((c) => c.platform === p && c.top_is_competitor) || cells.find((c) => c.platform === p && hasShelf(c))
  const task = sample && `${p}:${sample.pincode}`
  const shot = useFinalShot(task, keyword)
  return (
    <motion.article layout className="grid grid-cols-[1fr_120px] overflow-hidden rounded-2xl border border-line bg-card">
      <div className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><PlatformDot p={p} size={10} />{cfg.platforms[p].name}</div>
        {s.n ? (
          <>
            <div className="mt-2 font-serif text-3xl leading-none">#1 in {s.rank1}<span className="text-ink-3">/{s.n}</span></div>
            <div className="text-xs text-ink-2">areas you rank first</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-ok" style={{ width: `${(100 * s.inStock) / s.n}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-ink-2">
              <span>In stock {s.inStock}/{s.n}</span>
              {s.maxDiscount > 0 && <span>Up to {s.maxDiscount}% off MRP</span>}
            </div>
            {s.rival && <div className="mt-2 text-xs"><span className="text-oos">●</span> {s.rival} takes #1 in {s.lost} area{s.lost > 1 ? 's' : ''}</div>}
            {s.blocked > 0 && <div className="mt-1 text-xs text-ink-2">■ Blocked our agent in {s.blocked} area{s.blocked > 1 ? 's' : ''}</div>}
          </>
        ) : <div className="mt-2 text-sm text-ink-3">{s.blocked ? `Blocked our agent in ${s.blocked} area${s.blocked > 1 ? 's' : ''}` : 'No results yet'}</div>}
      </div>
      <button onClick={() => task && onProof(task)} className="relative bg-paper" disabled={!shot} title="Open proof">
        {shot && <img src={shot} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />}
        {shot && <span className="absolute bottom-1.5 right-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] text-paper">proof</span>}
      </button>
    </motion.article>
  )
}

export function PlatformCards({ cfg, platforms, cells, keyword, onProof }) {
  return (
    <div className="grid content-start gap-3">
      <Eyebrow>By platform</Eyebrow>
      {platforms.map((p) => <PlatformCard key={p} p={p} cfg={cfg} cells={cells} keyword={keyword} onProof={onProof} />)}
    </div>
  )
}

function ShelfShot({ task, cell, alert, cfg, keyword, onProof }) {
  const shot = useFinalShot(task, keyword)
  const [p, z] = task.split(':')
  return (
    <motion.button layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onClick={() => onProof(task)}
      className="group w-72 shrink-0 overflow-hidden rounded-2xl border border-line bg-card text-left">
      <div className="relative h-44 bg-paper">
        {shot && <img src={shot} alt="" className="h-full w-full object-cover object-top transition group-hover:scale-[1.02]" />}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm">
          <PlatformDot p={p} /> {cfg.platforms[p].name} · {cfg.pincodes[z].area}
        </span>
      </div>
      <div className="p-3 text-sm">
        <div className="font-medium leading-snug">{alert.text}</div>
        <div className="mt-1 text-[11px] text-ink-3">{cell.eta ? `${cell.eta} min delivery · ` : ''}Tap to see every step</div>
      </div>
    </motion.button>
  )
}

export function EvidenceStrip({ cfg, state, keyword, onProof }) {
  const seen = new Set()
  const items = state.alerts.filter((a) => a.level !== 'info' && !seen.has(a.task) && seen.add(a.task))
  if (!items.length) return null
  return (
    <section className="py-8">
      <Eyebrow right={<span className="text-xs text-ink-3">Real screenshots captured by the agents</span>}>What shoppers actually see</Eyebrow>
      <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
        {items.map((a) => <ShelfShot key={a.id} task={a.task} alert={a} cell={state.cells[a.task]} cfg={cfg} keyword={keyword} onProof={onProof} />)}
      </div>
    </section>
  )
}

export function Swarm({ cfg, state, watching, setWatching, onProof }) {
  const live = watching && state.tasks[watching]?.preview && state.tasks[watching]?.phase === 'running' ? watching : null
  return (
    <div>
      <Eyebrow right={<span className="text-xs text-ink-3">{state.order.length} agents{state.mode ? ` · ${state.mode}` : ''}</span>}>Agent swarm</Eyebrow>
      {live && (
        <div className="relative mb-3 h-[380px] overflow-hidden rounded-2xl border border-run bg-ink">
          <span className="absolute left-3 top-3 z-10 rounded bg-oos px-2 py-0.5 text-[11px] font-semibold text-white">● LIVE · {cfg.platforms[live.split(':')[0]].name} · {cfg.pincodes[live.split(':')[1]].area}</span>
          <iframe src={state.tasks[live].preview} title="Live agent browser" className="h-full w-full border-0" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {state.order.map((tid) => {
          const t = state.tasks[tid]
          const c = state.cells[tid]
          const st = STATUS[t.phase] || STATUS.idle
          const clickable = (t.phase === 'running' && t.preview) || (c && c.status !== 'error')
          return (
            <motion.button layout key={tid} disabled={!clickable}
              onClick={() => (t.phase === 'running' ? setWatching(tid) : onProof(tid))}
              className={`relative overflow-hidden rounded-xl border bg-card p-2.5 text-left ${watching === tid ? 'border-ink' : 'border-line'}`}>
              {t.phase === 'running' && <span className="sweep absolute bottom-0 left-0 h-0.5 w-2/5 bg-run" />}
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 truncate"><PlatformDot p={t.platform} />{cfg.platforms[t.platform].name}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ background: st.color }}>{c?.best_rank ? `#${c.best_rank}` : st.label}</span>
              </div>
              <div className="text-[11px] text-ink-3">{cfg.pincodes[t.pincode].area}{t.replay ? ' · recorded' : ''}</div>
              <div className="mt-1 h-8 overflow-hidden font-mono text-[10.5px] leading-4 text-ink-2">{t.log[0] ? `› ${t.log[0]}` : ' '}</div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export function Alerts({ cfg, alerts, onProof, onShare }) {
  const tone = { critical: 'bg-oos', warning: 'bg-nl', info: 'bg-run' }
  return (
    <div>
      <Eyebrow right={alerts.length > 0 && <button onClick={onShare} className="rounded-full bg-[#25d366] px-3 py-1 text-xs font-semibold text-white">Send to WhatsApp</button>}>
        Alerts {alerts.length > 0 && <span className="ml-1 text-ink">{alerts.length}</span>}
      </Eyebrow>
      {!alerts.length && <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-ink-3">Alerts appear here as agents report back.</div>}
      <ul className="grid max-h-[560px] gap-2 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {alerts.map((a) => {
            const [p, z] = a.task.split(':')
            return (
              <motion.li key={a.id} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
                <button onClick={() => onProof(a.task)} className="grid w-full grid-cols-[4px_1fr_auto] gap-3 rounded-xl border border-line bg-card p-3 text-left hover:border-ink">
                  <span className={`rounded-full ${tone[a.level]}`} />
                  <span>
                    <span className="block text-sm leading-snug">{a.text}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-ink-3"><PlatformDot p={p} size={6} />{cfg.platforms[p].name} · {cfg.pincodes[z].area} {z}</span>
                  </span>
                  <span className="self-center text-[11px] font-semibold text-ink-2 underline decoration-line underline-offset-4">proof</span>
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}

export function Matrix({ cfg, platforms, state, onProof }) {
  const pins = [...new Set(Object.values(state.cells).map((c) => c.pincode))]
  if (!pins.length) return null
  return (
    <section className="py-8">
      <Eyebrow>Shelf matrix</Eyebrow>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[.1em] text-ink-3">
              <th className="px-4 py-3 font-medium">Area</th>
              {platforms.map((p) => <th key={p} className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-1.5"><PlatformDot p={p} />{cfg.platforms[p].name}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {pins.map((z) => (
              <tr key={z} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><div className="font-medium">{cfg.pincodes[z].area}</div><div className="text-[11px] text-ink-3">{z}</div></td>
                {platforms.map((p) => {
                  const c = state.cells[`${p}:${z}`]
                  if (!c) return <td key={p} className="px-4 py-3 text-ink-3">·</td>
                  const top = c.products?.find((x) => x.rank === c.best_rank)
                  return (
                    <td key={p} className="px-4 py-3">
                      <button onClick={() => onProof(`${p}:${z}`)} className="text-left">
                        <span className="text-[11px] font-semibold" style={{ color: STATUS[c.status].color }}>{STATUS[c.status].label}</span>
                        <div className="tabular-nums">{c.best_rank ? `#${c.best_rank}` : '–'}{top?.price ? ` · ₹${top.price}` : ''}{top?.mrp > top?.price ? <span className="ml-1 text-ink-3 line-through">₹{top.mrp}</span> : null}</div>
                        {c.top_is_competitor && <div className="text-[11px] text-oos">#1 {c.top_product.brand}</div>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
