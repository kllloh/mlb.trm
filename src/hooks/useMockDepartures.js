import { useEffect, useRef } from 'react'
import { startSimulator, stopSimulator } from '../mock/simulator'

export function useMockDepartures(onArrival, onCrossing, paused, onDisrupt) {
  const arrivalRef  = useRef(onArrival)
  const crossingRef = useRef(onCrossing)
  const disruptRef  = useRef(onDisrupt)
  arrivalRef.current  = onArrival
  crossingRef.current = onCrossing
  disruptRef.current  = onDisrupt

  useEffect(() => {
    if (paused) { stopSimulator(); return }
    startSimulator(
      (e) => arrivalRef.current?.(e),
      (e) => crossingRef.current?.(e),
      (e) => disruptRef.current?.(e),
    )
    return () => stopSimulator()
  }, [paused])
}
