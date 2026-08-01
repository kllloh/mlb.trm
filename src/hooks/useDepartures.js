import { useCallback } from 'react'
import { useMockDepartures } from './useMockDepartures'
import { useLiveTrams } from './useLiveTrams'
import { getTramPositions } from '../mock/simulator'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// Mock wrapper returns the simulator's interpolated positions
function useMockWithPositions(onArrival, onCrossing, paused, onDisrupt) {
  useMockDepartures(onArrival, onCrossing, paused, onDisrupt)
  // getTramPositions is stable — wrap in a callback so the shape matches live mode
  const getPositions = useCallback(() => getTramPositions(), [])
  return { getPositions }
}

export const useDepartures = USE_MOCK ? useMockWithPositions : useLiveTrams
