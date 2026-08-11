import { useCallback, useEffect, useMemo, useState } from 'react'

import { MapMaskCanvas } from 'renderer/components/map-mask/map-mask-canvas'
import type {
  MapMaskLabel,
  MapMaskLabelsResponse,
  MapMaskState,
  MapMaskViewport,
  MapMaskVisiblePointsResponse,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

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

export function MapMaskOverlayScreen() {
  const [labels, setLabels] = useState<MapMaskLabel[]>([])
  const [visibleResult, setVisibleResult] =
    useState<MapMaskVisiblePointsResponse | null>(null)
  const [overlaySize, setOverlaySize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

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
    const result = (await window.App.rpc.request(
      'map_mask.get_visible_points'
    )) as MapMaskVisiblePointsResponse
    setVisibleResult(result)
  }, [])

  const syncToGameWindow = useCallback(async () => {
    await window.App.mapMaskOverlay?.syncToGameWindow()
  }, [])

  useEffect(() => {
    let disposed = false
    let starting = false
    let visiblePollInFlight = false
    let boundsPollInFlight = false
    let visibleTimer: number | null = null
    let boundsTimer: number | null = null

    document.documentElement.classList.add('overlay-window')
    document.body.classList.add('overlay-window')
    void window.App.mapMaskOverlay?.setIgnoreMouseEvents(true, {
      forward: true,
    })

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

    const pollBounds = async () => {
      if (boundsPollInFlight || disposed) return
      boundsPollInFlight = true
      try {
        await syncToGameWindow()
      } catch {
        // The game window may disappear temporarily while minimized.
      } finally {
        boundsPollInFlight = false
      }
    }

    const stopPolling = () => {
      if (visibleTimer !== null) window.clearInterval(visibleTimer)
      if (boundsTimer !== null) window.clearInterval(boundsTimer)
      visibleTimer = null
      boundsTimer = null
    }

    const startPolling = async () => {
      if (starting || visibleTimer !== null || disposed) return
      starting = true
      await Promise.allSettled([
        refreshLabels(),
        pollVisiblePoints(),
        pollBounds(),
      ])
      if (!disposed && document.visibilityState === 'visible') {
        visibleTimer = window.setInterval(() => void pollVisiblePoints(), 50)
        boundsTimer = window.setInterval(() => void pollBounds(), 800)
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
  }, [refreshLabels, refreshVisiblePoints, syncToGameWindow])

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
        onPointClick={() => undefined}
        onPointHover={() => undefined}
        points={renderedPoints}
        selectedPointId={null}
        viewport={overlayViewport}
      />
    </main>
  )
}
