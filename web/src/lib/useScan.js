import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

const initial = { jobId: null, status: 'idle', mode: null, order: [], tasks: {}, cells: {}, alerts: [], score: null, seconds: 0, startedAt: null }

function patchTask(state, tid, patch) {
  const prev = state.tasks[tid] || { log: [] }
  return { ...state, tasks: { ...state.tasks, [tid]: { ...prev, ...patch } } }
}

function reducer(state, a) {
  switch (a.type) {
    case 'reset':
      return { ...initial, status: 'running', startedAt: Date.now() }
    case 'job': {
      const tasks = {}
      for (const t of a.tasks) {
        const [platform, pincode] = t.split(':')
        tasks[t] = { platform, pincode, phase: 'idle', log: [] }
      }
      return { ...state, jobId: a.jobId, mode: a.mode, order: a.tasks, tasks }
    }
    case 'queued':
      return patchTask(state, a.task, { phase: 'queued' })
    case 'started':
      return patchTask(state, a.task, { phase: 'running', replay: !!a.replay, runId: a.run_id })
    case 'progress': {
      const t = state.tasks[a.task]
      return patchTask(state, a.task, { phase: 'running', log: [a.text, ...(t?.log || [])].slice(0, 6) })
    }
    case 'preview':
      return patchTask(state, a.task, { preview: a.url })
    case 'skipped':
      return patchTask(state, a.task, { phase: 'error', log: [a.text] })
    case 'cell':
      return {
        ...patchTask(state, a.task, { phase: a.cell.status }),
        cells: { ...state.cells, [a.task]: a.cell },
        alerts: [...a.alerts.map((x, i) => ({ ...x, task: a.task, id: `${a.task}-${i}` })), ...state.alerts],
      }
    case 'score':
      return { ...state, score: a.score }
    case 'done':
      return { ...state, status: 'done', seconds: a.seconds }
    default:
      return state
  }
}

export function useScan() {
  const [state, dispatch] = useReducer(reducer, initial)
  const es = useRef(null)

  const start = useCallback(async (body) => {
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) return (await res.json().catch(() => ({}))).detail || 'Scan refused'
    es.current?.close()
    dispatch({ type: 'reset' })
    const { job_id } = await res.json()
    const source = new EventSource(`/api/scan/${job_id}/events`)
    es.current = source
    source.onmessage = (m) => {
      const ev = JSON.parse(m.data)
      if (ev.type === 'job') dispatch({ type: 'job', jobId: job_id, tasks: ev.tasks, mode: ev.mode })
      else dispatch(ev)
      if (ev.type === 'done') source.close()
    }
  }, [])

  useEffect(() => () => es.current?.close(), [])
  return [state, start]
}

export function useConfig() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => { fetch('/api/config').then((r) => r.json()).then(setCfg) }, [])
  return cfg
}

export function useElapsed(state) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (state.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.status])
  if (state.status === 'done') return state.seconds
  if (!state.startedAt) return 0
  return Math.max(0, Math.round((now - state.startedAt) / 1000))
}

const evidenceCache = new Map()
export async function fetchEvidence(task, keyword) {
  const key = `${task}|${keyword}`
  if (!evidenceCache.has(key)) {
    const [p, z] = task.split(':')
    evidenceCache.set(key, fetch(`/api/evidence/${p}/${z}?keyword=${encodeURIComponent(keyword)}`).then((r) => (r.ok ? r.json() : null)))
  }
  return evidenceCache.get(key)
}
