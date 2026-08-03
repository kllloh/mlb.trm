import { useState, useCallback, useEffect, useRef } from 'react'
import { playPercussion, playInstrument, unlock,
         getNextGridTime, getAudioTime, getSubdivSecs } from '../lib/audioEngine'
import { toneForRoute } from '../lib/routeTones'

const FLASH_MS     = 1800
const CROSSING_MS  = 3000
const MAX_PER_TICK = 2      // voices released per 16th-note grid slot
const LOOKAHEAD    = 0.30   // schedule up to 300 ms ahead

export function useToneEngine(freqMap, octave, muted, congested, incidents, instrumentSet) {
  const [active,    setActive]    = useState(new Map())
  const [crossings, setCrossings] = useState(new Map())

  const freqMapRef      = useRef(freqMap)
  const octaveRef       = useRef(octave   ?? 0)
  const mutedRef        = useRef(muted    ?? new Set())
  const congestedRef    = useRef(congested ?? new Set())
  const incidentsRef    = useRef(incidents ?? new Set())
  const instrumentSetRef = useRef(instrumentSet ?? null)
  const activeTimers    = useRef(new Map())
  const crossingTimers  = useRef(new Map())

  // Queue: routeNumber → { routeNumber, isCrossing }
  // Map preserves insertion order; crossings are re-inserted at the front.
  const pendingRef   = useRef(new Map())
  const schedHeadRef = useRef(null)   // next unallocated grid time in AC seconds

  useEffect(() => { freqMapRef.current       = freqMap               }, [freqMap])
  useEffect(() => { instrumentSetRef.current = instrumentSet ?? null }, [instrumentSet])
  useEffect(() => { octaveRef.current    = octave    ?? 0       }, [octave])
  useEffect(() => { mutedRef.current     = muted     ?? new Set() }, [muted])
  useEffect(() => { congestedRef.current = congested ?? new Set() }, [congested])
  useEffect(() => { incidentsRef.current = incidents ?? new Set() }, [incidents])

  // ── Fire a single queued event at a scheduled AC time ─────────────────────
  const fireOne = useCallback((item, startAt) => {
    const key  = String(item.routeNumber)
    const tone = toneForRoute(item.routeNumber)
    const baseFreq = freqMapRef.current?.[key] ?? 220
    const freq     = baseFreq * Math.pow(2, octaveRef.current)
    const incidentDelay = incidentsRef.current.has(key)
    const extraReverb   = congestedRef.current.has(key)
    const vol = item.isCrossing ? 0.52 : 0.45
    const iset = instrumentSetRef.current
    if (iset) {
      playInstrument(iset, { pan: tone.pan, freq, vol, incidentDelay, extraReverb, startAt })
    } else {
      playPercussion(tone.percType, {
        pan: tone.pan, freq, vol,
        delayed: Math.random() < 0.25, incidentDelay, extraReverb, startAt,
      })
    }
  }, [])

  // ── Lookahead scheduler — runs every 25 ms ────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = getAudioTime()
      if (now === null || pendingRef.current.size === 0) return

      // Initialise or recover the scheduler head
      let head = schedHeadRef.current
      if (head === null || head < now - 1.0) head = getNextGridTime()

      const sub = getSubdivSecs()

      while (head < now + LOOKAHEAD && pendingRef.current.size > 0) {
        // Drain up to MAX_PER_TICK entries for this grid slot
        const entries = [...pendingRef.current.entries()].slice(0, MAX_PER_TICK)
        for (const [key, item] of entries) {
          pendingRef.current.delete(key)
          fireOne(item, head)
        }
        head += sub
      }
      schedHeadRef.current = head
    }, 25)
    return () => clearInterval(id)
  }, [fireOne])

  // ── Visual flash helper ───────────────────────────────────────────────────
  const flashRoute = useCallback((key, tone) => {
    setActive(prev => {
      const n = new Map(prev)
      n.set(key, { percLabel: tone.percLabel, color: tone.color, routeNumber: key })
      return n
    })
    if (activeTimers.current.has(key)) clearTimeout(activeTimers.current.get(key))
    activeTimers.current.set(key, setTimeout(() => {
      setActive(prev => { const n = new Map(prev); n.delete(key); return n })
      activeTimers.current.delete(key)
    }, FLASH_MS))
  }, [])

  // ── Public API ─────────────────────────────────────────────────────────────
  const trigger = useCallback(({ routeNumber }) => {
    const key = String(routeNumber)
    if (mutedRef.current.has(key)) return
    flashRoute(key, toneForRoute(routeNumber))
    // Queue audio — deduplicated by route (latest arrival overwrites)
    pendingRef.current.set(key, { routeNumber, isCrossing: false })
  }, [flashRoute])

  const triggerCrossing = useCallback(({ routeNumber }) => {
    const key = String(routeNumber)
    if (mutedRef.current.has(key)) return
    const tone = toneForRoute(routeNumber)
    flashRoute(key, tone)

    // Crossings go to the front of the queue by re-inserting after a delete
    pendingRef.current.delete(key)
    const front = new Map([[key, { routeNumber, isCrossing: true }]])
    for (const [k, v] of pendingRef.current) front.set(k, v)
    pendingRef.current = front

    setCrossings(prev => {
      const n = new Map(prev)
      n.set(key, { percLabel: tone.percLabel, color: tone.color, routeNumber: key })
      return n
    })
    if (crossingTimers.current.has(key)) clearTimeout(crossingTimers.current.get(key))
    crossingTimers.current.set(key, setTimeout(() => {
      setCrossings(prev => { const n = new Map(prev); n.delete(key); return n })
      crossingTimers.current.delete(key)
    }, CROSSING_MS))
  }, [flashRoute])

  return { trigger, triggerCrossing, active, crossings, unlock }
}
