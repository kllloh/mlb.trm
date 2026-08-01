import { useState, useCallback, useEffect, useRef } from 'react'
import { playPercussion, playInstrument, unlock } from '../lib/audioEngine'
import { toneForRoute } from '../lib/routeTones'

const FLASH_MS    = 1800
const CROSSING_MS = 3000

export function useToneEngine(freqMap, octave, muted, congested, incidents, instrumentSet) {
  const [active,    setActive]    = useState(new Map())
  const [crossings, setCrossings] = useState(new Map())

  const freqMapRef    = useRef(freqMap)
  const octaveRef     = useRef(octave   ?? 0)
  const mutedRef      = useRef(muted    ?? new Set())
  const congestedRef  = useRef(congested ?? new Set())
  const incidentsRef  = useRef(incidents ?? new Set())
  // One debounced clear-timer per route — prevents 50 trams/route each
  // scheduling their own setTimeout and flooding React with re-renders.
  const instrumentSetRef = useRef(instrumentSet ?? null)
  const activeTimers     = useRef(new Map())
  const crossingTimers   = useRef(new Map())

  useEffect(() => { freqMapRef.current      = freqMap               }, [freqMap])
  useEffect(() => { instrumentSetRef.current = instrumentSet ?? null }, [instrumentSet])
  useEffect(() => { octaveRef.current    = octave   ?? 0      }, [octave])
  useEffect(() => { mutedRef.current     = muted    ?? new Set() }, [muted])
  useEffect(() => { congestedRef.current = congested ?? new Set() }, [congested])
  useEffect(() => { incidentsRef.current = incidents ?? new Set() }, [incidents])

  const trigger = useCallback(({ routeNumber }) => {
    const key = String(routeNumber)
    if (mutedRef.current.has(key)) return

    const tone     = toneForRoute(routeNumber)
    const baseFreq = freqMapRef.current?.[key] ?? 220
    const freq     = baseFreq * Math.pow(2, octaveRef.current)

    const incidentDelay = incidentsRef.current.has(key)
    const extraReverb   = congestedRef.current.has(key)
    const iset = instrumentSetRef.current
    if (iset) {
      playInstrument(iset, { pan: tone.pan, freq, vol: 0.45, incidentDelay, extraReverb })
    } else {
      playPercussion(tone.percType, {
        pan: tone.pan, freq, vol: 0.45,
        delayed: Math.random() < 0.25, incidentDelay, extraReverb,
      })
    }

    setActive(prev => {
      const next = new Map(prev)
      next.set(key, { percLabel: tone.percLabel, color: tone.color, routeNumber: key })
      return next
    })
    if (activeTimers.current.has(key)) clearTimeout(activeTimers.current.get(key))
    activeTimers.current.set(key, setTimeout(() => {
      setActive(prev => { const n = new Map(prev); n.delete(key); return n })
      activeTimers.current.delete(key)
    }, FLASH_MS))
  }, [])

  const triggerCrossing = useCallback(({ routeNumber }) => {
    const key = String(routeNumber)
    if (mutedRef.current.has(key)) return

    const tone     = toneForRoute(routeNumber)
    const baseFreq = freqMapRef.current?.[key] ?? 220
    const freq     = baseFreq * Math.pow(2, octaveRef.current)

    const incidentDelay = incidentsRef.current.has(key)
    const extraReverb    = congestedRef.current.has(key)
    const iset = instrumentSetRef.current
    if (iset) {
      playInstrument(iset, { pan: tone.pan, freq, vol: 0.52, incidentDelay, extraReverb })
    } else {
      playPercussion(tone.percType, {
        pan: tone.pan, freq, vol: 0.52,
        delayed: Math.random() < 0.25, incidentDelay, extraReverb,
      })
    }

    setActive(prev => {
      const next = new Map(prev)
      next.set(key, { percLabel: tone.percLabel, color: tone.color, routeNumber: key })
      return next
    })
    if (activeTimers.current.has(key)) clearTimeout(activeTimers.current.get(key))
    activeTimers.current.set(key, setTimeout(() => {
      setActive(prev => { const n = new Map(prev); n.delete(key); return n })
      activeTimers.current.delete(key)
    }, FLASH_MS))

    setCrossings(prev => {
      const next = new Map(prev)
      next.set(key, { percLabel: tone.percLabel, color: tone.color, routeNumber: key })
      return next
    })
    if (crossingTimers.current.has(key)) clearTimeout(crossingTimers.current.get(key))
    crossingTimers.current.set(key, setTimeout(() => {
      setCrossings(prev => { const n = new Map(prev); n.delete(key); return n })
      crossingTimers.current.delete(key)
    }, CROSSING_MS))
  }, [])

  return { trigger, triggerCrossing, active, crossings, unlock }
}
