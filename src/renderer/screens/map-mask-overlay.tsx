import log from 'electron-log/renderer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MapMaskCanvas } from 'renderer/components/map-mask/map-mask-canvas'
import type {
  MapMaskLabel,
  MapMaskLabelsResponse,
  MapMaskState,
  MapMaskViewport,
  MapMaskVisiblePointsResponse,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

const POINT_POSITION_TOLERANCE_PX = 2
const PERFORMANCE_LOG_INTERVAL_MS = 2000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidViewport(
  viewport: MapMaskState['viewport']
): viewport is MapMaskViewport {
  return Boolean(
    viewport &&
      typeof viewport.map_name === 'string' &&
      isFiniteNumber(viewport.image_left) &&
      isFiniteNumber(viewport.image_top) &&
      isFiniteNumber(viewport.image_width) &&
      viewport.image_width > 0 &&
      isFiniteNumber(viewport.image_height) &&
      viewport.image_height > 0 &&
      isFiniteNumber(viewport.screen_left) &&
      isFiniteNumber(viewport.screen_top) &&
      isFiniteNumber(viewport.screen_width) &&
      viewport.screen_width > 0 &&
      isFiniteNumber(viewport.screen_height) &&
      viewport.screen_height > 0 &&
      isFiniteNumber(viewport.scale)
  )
}

function viewportForOverlayCoordinates(
  viewport: MapMaskViewport | null,
  sourceScreenWidth: number | null | undefined,
  sourceScreenHeight: number | null | undefined,
  overlayWidth: number,
  overlayHeight: number
): MapMaskViewport | null {
  if (!viewport) return null

  const inferredSourceWidth = Math.max(
    viewport.screen_width,
    viewport.screen_left + viewport.screen_width
  )
  const inferredSourceHeight = Math.max(
    viewport.screen_height,
    viewport.screen_top + viewport.screen_height
  )
  const sourceWidth =
    isFiniteNumber(sourceScreenWidth) && sourceScreenWidth > 0
      ? sourceScreenWidth
      : inferredSourceWidth
  const sourceHeight =
    isFiniteNumber(sourceScreenHeight) && sourceScreenHeight > 0
      ? sourceScreenHeight
      : inferredSourceHeight
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    overlayWidth <= 0 ||
    overlayHeight <= 0
  ) {
    return viewport
  }

  const scaleX = overlayWidth / sourceWidth
  const scaleY = overlayHeight / sourceHeight
  if (Math.abs(scaleX - 1) < 0.000001 && Math.abs(scaleY - 1) < 0.000001) {
    return viewport
  }
  return {
    ...viewport,
    screen_left: viewport.screen_left * scaleX,
    screen_top: viewport.screen_top * scaleY,
    screen_width: viewport.screen_width * scaleX,
    screen_height: viewport.screen_height * scaleY,
  }
}

function remapVisiblePoints(
  points: VisibleMapMaskPoint[],
  sourceViewport: MapMaskViewport | null,
  targetViewport: MapMaskViewport | null
) {
  if (!sourceViewport || !targetViewport || sourceViewport === targetViewport)
    return points
  return points.flatMap(point => {
    const imageX =
      sourceViewport.image_left +
      ((point.screen_x - sourceViewport.screen_left) /
        sourceViewport.screen_width) *
        sourceViewport.image_width
    const imageY =
      sourceViewport.image_top +
      ((point.screen_y - sourceViewport.screen_top) /
        sourceViewport.screen_height) *
        sourceViewport.image_height
    const relativeX =
      (imageX - targetViewport.image_left) / targetViewport.image_width
    const relativeY =
      (imageY - targetViewport.image_top) / targetViewport.image_height
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1)
      return []
    return [
      {
        ...point,
        screen_x:
          targetViewport.screen_left + relativeX * targetViewport.screen_width,
        screen_y:
          targetViewport.screen_top + relativeY * targetViewport.screen_height,
      },
    ]
  })
}

function hasSameViewport(
  previous: MapMaskState['viewport'],
  next: MapMaskState['viewport']
) {
  const previousValid = isValidViewport(previous)
  const nextValid = isValidViewport(next)
  if (!previousValid || !nextValid) return previousValid === nextValid
  return previous.map_name === next.map_name
}

function hasSameRenderableSnapshot(
  previous: MapMaskVisiblePointsResponse | null,
  next: MapMaskVisiblePointsResponse
) {
  if (!previous) return false
  if (
    previous.state.enabled !== next.state.enabled ||
    previous.state.is_bigmap_open !== next.state.is_bigmap_open ||
    previous.state.viewport_screen_width !==
      next.state.viewport_screen_width ||
    previous.state.viewport_screen_height !==
      next.state.viewport_screen_height ||
    !hasSameViewport(previous.state.viewport, next.state.viewport) ||
    previous.points.length !== next.points.length
  ) {
    return false
  }

  for (let index = 0; index < previous.points.length; index += 1) {
    const previousPoint = previous.points[index]
    const nextPoint = next.points[index]
    if (
      previousPoint.id !== nextPoint.id ||
      previousPoint.label_id !== nextPoint.label_id ||
      Math.abs(previousPoint.screen_x - nextPoint.screen_x) >=
        POINT_POSITION_TOLERANCE_PX ||
      Math.abs(previousPoint.screen_y - nextPoint.screen_y) >=
        POINT_POSITION_TOLERANCE_PX
    ) {
      return false
    }
  }
  return true
}

export function MapMaskOverlayScreen() {
  const [labels, setLabels] = useState<MapMaskLabel[]>([])
  const [visibleResult, setVisibleResult] =
    useState<MapMaskVisiblePointsResponse | null>(null)
  const [overlaySize, setOverlaySize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  const lastRenderableResultRef =
    useRef<MapMaskVisiblePointsResponse | null>(null)
  const snapshotStatsRef = useRef({
    requests: 0,
    successes: 0,
    failures: 0,
    visualUpdates: 0,
    skippedUpdates: 0,
    totalRpcMs: 0,
    maxRpcMs: 0,
    pointCount: 0,
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stats = snapshotStatsRef.current
      const averageRpcMs = stats.successes
        ? stats.totalRpcMs / stats.successes
        : 0
      log.info(
        '[map-mask-perf] snapshots ' +
          `requests=${stats.requests} successes=${stats.successes} ` +
          `failures=${stats.failures} visual_updates=${stats.visualUpdates} ` +
          `skipped=${stats.skippedUpdates} ` +
          `avg_rpc_ms=${averageRpcMs.toFixed(2)} ` +
          `max_rpc_ms=${stats.maxRpcMs.toFixed(2)} ` +
          `points=${stats.pointCount}`
      )
      snapshotStatsRef.current = {
        requests: 0,
        successes: 0,
        failures: 0,
        visualUpdates: 0,
        skippedUpdates: 0,
        totalRpcMs: 0,
        maxRpcMs: 0,
        pointCount: stats.pointCount,
      }
    }, PERFORMANCE_LOG_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const updateOverlaySize = () => {
      setOverlaySize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', updateOverlaySize)
    updateOverlaySize()
    return () => window.removeEventListener('resize', updateOverlaySize)
  }, [])

  const refreshLabels = useCallback(async () => {
    const result = (await window.App.rpc.request(
      'map_mask.get_labels'
    )) as MapMaskLabelsResponse
    setLabels(result.labels)
  }, [])

  const refreshVisiblePoints = useCallback(async () => {
    const started = performance.now()
    snapshotStatsRef.current.requests += 1
    try {
      const result = (await window.App.rpc.request(
        'map_mask.get_visible_points'
      )) as MapMaskVisiblePointsResponse
      const elapsed = performance.now() - started
      const stats = snapshotStatsRef.current
      stats.successes += 1
      stats.totalRpcMs += elapsed
      stats.maxRpcMs = Math.max(stats.maxRpcMs, elapsed)
      stats.pointCount = result.points.length
      if (hasSameRenderableSnapshot(lastRenderableResultRef.current, result)) {
        stats.skippedUpdates += 1
        return
      }
      lastRenderableResultRef.current = result
      stats.visualUpdates += 1
      setVisibleResult(result)
    } catch (error) {
      snapshotStatsRef.current.failures += 1
      throw error
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let starting = false
    let visiblePollInFlight = false
    let visibleTimer: number | null = null

    document.documentElement.classList.add('overlay-window')
    document.body.classList.add('overlay-window')
    void window.App.mapMaskOverlay?.setIgnoreMouseEvents(true)

    const pollVisiblePoints = async () => {
      if (visiblePollInFlight || disposed) return
      visiblePollInFlight = true
      try {
        await refreshVisiblePoints()
      } catch {
        // Keep the last successfully rendered frame during temporary RPC failures.
      } finally {
        visiblePollInFlight = false
      }
    }

    const stopPolling = () => {
      if (visibleTimer !== null) window.clearInterval(visibleTimer)
      visibleTimer = null
    }

    const startPolling = async () => {
      if (starting || visibleTimer !== null || disposed) return
      starting = true
      await Promise.allSettled([
        refreshLabels(),
        pollVisiblePoints(),
      ])
      if (!disposed && document.visibilityState === 'visible') {
        visibleTimer = window.setInterval(() => void pollVisiblePoints(), 50)
      }
      starting = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void startPolling()
      } else {
        stopPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    handleVisibilityChange()

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopPolling()
      document.documentElement.classList.remove('overlay-window')
      document.body.classList.remove('overlay-window')
    }
  }, [refreshLabels, refreshVisiblePoints])

  const sourceViewport = visibleResult?.state.viewport ?? null
  const activeViewport = isValidViewport(sourceViewport) ? sourceViewport : null
  const overlayViewport = useMemo(
    () =>
      viewportForOverlayCoordinates(
        activeViewport,
        visibleResult?.state.viewport_screen_width,
        visibleResult?.state.viewport_screen_height,
        overlaySize.width,
        overlaySize.height
      ),
    [
      activeViewport,
      overlaySize.height,
      overlaySize.width,
      visibleResult?.state.viewport_screen_height,
      visibleResult?.state.viewport_screen_width,
    ]
  )
  const renderedPoints = useMemo(
    () =>
      remapVisiblePoints(
        visibleResult?.points ?? [],
        activeViewport,
        overlayViewport
      ),
    [activeViewport, overlayViewport, visibleResult?.points]
  )
  const enabled = Boolean(
    visibleResult?.state.enabled &&
      visibleResult.state.is_bigmap_open &&
      activeViewport &&
      overlayViewport
  )

  return (
    <main className="pointer-events-none relative h-screen w-screen overflow-hidden bg-transparent">
      <MapMaskCanvas
        enabled={enabled}
        labels={labels}
        points={renderedPoints}
      />
    </main>
  )
}
