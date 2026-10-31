import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { STATUS } from '../lib/verdict'

// One marker per area: a pill with a segment per platform showing status + rank
function markerHtml(cfg, z, platforms, tasks, cells) {
  const segs = platforms.map((p) => {
    const t = tasks[`${p}:${z}`]
    const c = cells[`${p}:${z}`]
    const phase = c?.status || t?.phase || 'idle'
    const color = STATUS[phase]?.color || STATUS.idle.color
    const label = c?.best_rank ? `#${c.best_rank}` : phase === 'running' ? '•••' : '–'
    const pulse = phase === 'running' ? 'animation: pulse 1s ease-in-out infinite;' : ''
    return `<span title="${cfg.platforms[p].name}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:999px;background:${color};color:#fff;font:600 10px/1.4 'Inter Tight',sans-serif;${pulse}">
      <i style="width:6px;height:6px;border-radius:50%;background:var(--color-${p});box-shadow:0 0 0 1.5px #fff"></i>${label}</span>`
  })
  const active = platforms.some((p) => tasks[`${p}:${z}`])
  return `<div style="transform:translate(-50%,-50%);display:inline-flex;flex-direction:column;align-items:center;gap:3px;opacity:${active ? 1 : 0.45}">
    <div style="display:flex;gap:3px;filter:drop-shadow(0 2px 4px #0003)">${active ? segs.join('') : ''}</div>
    <div style="background:#fffdf9;border:1px solid #e3dccf;border-radius:6px;padding:1px 7px;font:600 11px 'Inter Tight',sans-serif;color:#1b1813;white-space:nowrap;box-shadow:0 1px 3px #0002">${cfg.pincodes[z].area}</div>
  </div>`
}

export default function ShelfMap({ cfg, platforms, tasks, cells, onPick }) {
  const el = useRef(null)
  const map = useRef(null)
  const markers = useRef({})

  useEffect(() => {
    if (map.current) return
    map.current = L.map(el.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([12.952, 77.645], 11.4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map.current)
    L.control.zoom({ position: 'bottomright' }).addTo(map.current)
    return () => { map.current?.remove(); map.current = null; markers.current = {} }
  }, [])

  // Zoom to the areas in this scan so markers don't pile up
  const activePins = [...new Set(Object.values(tasks).map((t) => t.pincode))].sort().join(',')
  useEffect(() => {
    if (!map.current) return
    const pins = activePins ? activePins.split(',') : Object.keys(cfg.pincodes)
    const bounds = L.latLngBounds(pins.map((z) => [cfg.pincodes[z].lat, cfg.pincodes[z].lng]))
    map.current.invalidateSize()
    map.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 13 })
  }, [activePins, cfg])

  useEffect(() => {
    if (!map.current) return
    for (const [z, p] of Object.entries(cfg.pincodes)) {
      const icon = L.divIcon({ html: markerHtml(cfg, z, platforms, tasks, cells), className: '', iconSize: [0, 0] })
      if (!markers.current[z]) {
        markers.current[z] = L.marker([p.lat, p.lng], { icon }).addTo(map.current)
        markers.current[z].on('click', () => onPick?.(z))
      } else {
        markers.current[z].setIcon(icon)
      }
    }
  }, [cfg, platforms, tasks, cells, onPick])

  return (
    <div className="relative h-[600px] overflow-hidden rounded-2xl border border-line">
      <style>{'@keyframes pulse{50%{opacity:.55}}'}</style>
      <div ref={el} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl bg-card/95 px-3 py-2 shadow-sm ring-1 ring-line">
        <div className="font-serif text-xl leading-none">Bengaluru</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
          {['in_stock', 'out_of_stock', 'not_listed', 'blocked', 'running'].map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} />
              {STATUS[s].label}
            </span>
          ))}
          <span className="text-ink-3">#n = your search rank</span>
        </div>
      </div>
    </div>
  )
}
