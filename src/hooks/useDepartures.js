import { useCallback } from 'react'
import { useMockDepartures } from './useMockDepartures'
import { useLiveTrams } from './useLiveTrams'
import { useGtfsSimulation } from './useGtfsSimulation'
import { getTramPositions } from '../mock/simulator'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function useMockWithPositions(onArrival, onCrossing, paused, onDisrupt) {
  useMockDepartures(onArrival, onCrossing, paused, onDisrupt)
  const getPositions = useCallback(() => getTramPositions(), [])
  return { getPositions }
}

// Live mode: PTV API polling drives audio events; GTFS schedule drives dot positions
function useLiveWithGtfs(onArrival, onCrossing, paused, onDisrupt) {
  useLiveTrams(onArrival, onCrossing, paused, onDisrupt)
  const { getPositions } = useGtfsSimulation()
  return { getPositions }
}

export const useDepartures = USE_MOCK ? useMockWithPositions : useLiveWithGtfs
