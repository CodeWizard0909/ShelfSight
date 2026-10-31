// Turn finished cells into the story a brand manager cares about
export const STATUS = {
  in_stock: { label: 'In stock', color: 'var(--color-ok)' },
  out_of_stock: { label: 'Out of stock', color: 'var(--color-oos)' },
  not_listed: { label: 'Not listed', color: 'var(--color-nl)' },
  blocked: { label: 'Blocked', color: '#4a443b' },
  error: { label: 'Failed', color: 'var(--color-ink-3)' },
  running: { label: 'Scanning', color: 'var(--color-run)' },
  queued: { label: 'Queued', color: 'var(--color-ink-3)' },
  idle: { label: 'Waiting', color: 'var(--color-ink-3)' },
}

// A cell we can draw conclusions from (the agent actually saw the shelf)
export const hasShelf = (c) => c.status !== 'error' && c.status !== 'blocked'

const mostCommon = (arr) => {
  const counts = {}
  arr.forEach((x) => (counts[x] = (counts[x] || 0) + 1))
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
}

export function platformStats(cells, platform) {
  const cs = cells.filter((c) => c.platform === platform && hasShelf(c))
  const lost = cs.filter((c) => c.top_is_competitor)
  const discounts = cs.map((c) => c.max_discount || 0).filter(Boolean)
  return {
    n: cs.length,
    blocked: cells.filter((c) => c.platform === platform && c.status === 'blocked').length,
    inStock: cs.filter((c) => c.status === 'in_stock').length,
    rank1: cs.filter((c) => c.best_rank === 1).length,
    lost: lost.length,
    rival: mostCommon(lost.map((c) => c.top_product?.brand).filter(Boolean)),
    maxDiscount: discounts.length ? Math.max(...discounts) : 0,
    eta: cs.map((c) => c.eta).filter((x) => x > 0),
  }
}

export function verdict(brand, cells, cfg) {
  const done = cells.filter(hasShelf)
  if (!done.length) return null
  const blocked = cells.filter((c) => c.status === 'blocked').length
  const note = blocked ? ` ${blocked} check${blocked > 1 ? 's were' : ' was'} blocked by the app and left out.` : ''
  const area = (z) => cfg.pincodes[z]?.area || z
  const missing = done.filter((c) => c.status === 'out_of_stock' || c.status === 'not_listed')
  if (missing.length) {
    const areas = [...new Set(missing.map((c) => area(c.pincode)))]
    return {
      tone: 'bad',
      head: `${brand} is missing from the shelf in ${areas.length} area${areas.length > 1 ? 's' : ''}.`,
      sub: `Shoppers in ${areas.slice(0, 3).join(', ')}${areas.length > 3 ? '…' : ''} can't buy it right now. They see only competitors.${note}`,
    }
  }
  const worst = Object.keys(cfg.platforms)
    .map((p) => ({ p, ...platformStats(done, p) }))
    .filter((s) => s.n)
    .sort((a, b) => b.lost / b.n - a.lost / a.n)[0]
  if (worst?.lost) {
    return {
      tone: 'warn',
      head: `${brand} is on every shelf, but loses the #1 spot on ${cfg.platforms[worst.p].name} in ${worst.lost} of ${worst.n} areas.`,
      sub: `${worst.rival || 'A competitor'} ranks first when shoppers search for your brand. That's the click you paid for.${note}`,
    }
  }
  return { tone: 'good', head: `${brand} is in stock and #1 on every shelf we checked.`, sub: `No action needed today.${note}` }
}
