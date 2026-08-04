import { useCallback } from 'react'
import { useMockDepartures } from './useMockDepartures'
import { useGtfsSimulation } from './useGtfsSimulation'
import { getTramPositions } from '../mock/simulator'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function useMockWithPositions(onArrival, onCrossing, paused, onDisrupt) {
  useMockDepartures(onArrival, onCrossing, paused, onDisrupt)
  const getPositions = useCallback(() => getTramPositions(), [])
  return { getPositions }
}

// Live mode: fully driven by local GTFS data — no external API needed
export const useDepartures = USE_MOCK ? useMockWithPositions : useGtfsSimulation
