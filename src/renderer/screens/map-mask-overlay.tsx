import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { MapMaskCanvas } from 'renderer/components/map-mask/map-mask-canvas'
import type {
  MapMaskLabel,
  MapMaskLabelsResponse,
  MapMaskPoint,
  MapMaskState,
  MapMaskViewport,
  MapMaskVisiblePointsResponse,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

const POINT_POSITION_TOLERANCE_PX = 2
const SUPPORTED_ASPECT_RATIO_MIN = 1.55
const SUPPORTED_ASPECT_RATIO_MAX = 1.8
const UNSUPPORTED_RESOLUTION_HINT =
  '不支持当前游戏窗口分辨率，请在游戏设置中调整为窗口模式，和16:9或16:10分辨率'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isSupportedAspectRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) return true
  const aspectRatio = width / height
  return (
    aspectRatio > SUPPORTED_ASPECT_RATIO_MIN &&
    aspectRatio < SUPPORTED_ASPECT_RATIO_MAX
  )
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
    previous.state.is_main_world_open !== next.state.is_main_world_open ||
    previous.state.display_mode !== next.state.display_mode ||
    previous.state.minimap_tracking_status !==
      next.state.minimap_tracking_status ||
    previous.state.minimap_hint !== next.state.minimap_hint ||
    previous.state.zoom_status !== next.state.zoom_status ||
    previous.state.overlay_hint !== next.state.overlay_hint ||
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
  const backendDisabledHandledRef = useRef(false)
  const [selectedPoint, setSelectedPoint] = useState<VisibleMapMaskPoint | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [imageIndex, setImageIndex] = useState(0)
  const [detailCardHeight, setDetailCardHeight] = useState(0)
  const detailCardRef = useRef<HTMLElement | null>(null)
  const selectedPointRef = useRef<VisibleMapMaskPoint | null>(null)
  const renderedPointsRef = useRef<VisibleMapMaskPoint[]>([])
  const detailCacheRef = useRef(new Map<string, MapMaskPoint>())
  const hoverCandidateRef = useRef<{ id: string; since: number } | null>(null)
  const hoverLeftAtRef = useRef<number | null>(null)
  const cardInteractiveRef = useRef(false)
  const [cardInteractive, setCardInteractive] = useState(false)
  const detailRequestSequenceRef = useRef(0)
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
    if (!result.state.enabled) {
      if (!backendDisabledHandledRef.current) {
        backendDisabledHandledRef.current = true
        void window.App.mapMaskOverlay?.hide()
      }
    } else {
      backendDisabledHandledRef.current = false
    }
    if (hasSameRenderableSnapshot(lastRenderableResultRef.current, result)) {
      return
    }
    lastRenderableResultRef.current = result
    setVisibleResult(result)
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
        visibleTimer = window.setInterval(() => void pollVisiblePoints(), 20)
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
  renderedPointsRef.current = renderedPoints
  const resolutionSupported = isSupportedAspectRatio(
    overlaySize.width,
    overlaySize.height
  )
  const displayMode = visibleResult?.state.display_mode ?? 'hidden'
  const isBigmapDisplay = displayMode === 'bigmap'
  const isMinimapDisplay = displayMode === 'minimap'
  const enabled = Boolean(
    visibleResult?.state.enabled &&
      resolutionSupported &&
      (isBigmapDisplay || isMinimapDisplay) &&
      activeViewport &&
      overlayViewport
  )
  const overlayHint = visibleResult?.state.enabled
    ? !resolutionSupported
      ? UNSUPPORTED_RESOLUTION_HINT
      : isBigmapDisplay
        ? visibleResult.state.overlay_hint
        : ''
    : ''
  const minimapHint =
    visibleResult?.state.enabled &&
    resolutionSupported &&
    visibleResult.state.is_main_world_open
      ? visibleResult.state.minimap_hint
      : ''
  const minimapClipCircle =
    isMinimapDisplay && overlayViewport
      ? {
          x: overlayViewport.screen_left + overlayViewport.screen_width / 2,
          y: overlayViewport.screen_top + overlayViewport.screen_height / 2,
          radius:
            Math.min(
              overlayViewport.screen_width,
              overlayViewport.screen_height
            ) / 2,
        }
      : null
  const minimapHintPosition = (() => {
    const state = visibleResult?.state
    const sourceWidth = state?.viewport_screen_width ?? 1920
    const sourceHeight = state?.viewport_screen_height ?? 1080
    const centerX = state?.minimap_center_x ?? 181
    const centerY = state?.minimap_center_y ?? 122
    const radius = state?.minimap_radius ?? 102
    return {
      left: (centerX / sourceWidth) * overlaySize.width,
      top: Math.max(
        8,
        ((centerY - radius) / sourceHeight) * overlaySize.height + 4
      ),
    }
  })()

  const closeDetail = useCallback(() => {
    if (!selectedPointRef.current) return
    detailRequestSequenceRef.current += 1
    selectedPointRef.current = null
    hoverCandidateRef.current = null
    hoverLeftAtRef.current = null
    cardInteractiveRef.current = false
    setCardInteractive(false)
    setSelectedPoint(null)
    setDetailError('')
    setDetailLoading(false)
    setImageIndex(0)
  }, [])

  useEffect(() => {
    if (!enabled || !isBigmapDisplay) closeDetail()
  }, [closeDetail, enabled, isBigmapDisplay])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') closeDetail()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [closeDetail])

  useEffect(() => {
    void window.App.mapMaskOverlay?.setIgnoreMouseEvents(!cardInteractive)
    return () => {
      void window.App.mapMaskOverlay?.setIgnoreMouseEvents(true)
    }
  }, [cardInteractive])

  const showDetail = useCallback((hit: VisibleMapMaskPoint) => {
    const cached = detailCacheRef.current.get(hit.id)
    const initialPoint = { ...hit, ...(cached ?? {}), detail: cached?.detail ?? hit.detail ?? {} }
    selectedPointRef.current = initialPoint
    setSelectedPoint(initialPoint)
    setDetailLoading(!cached)
    setDetailError('')
    setImageIndex(0)
    if (cached) return
    const requestSequence = ++detailRequestSequenceRef.current
    void window.App.rpc
      .request('map_mask.get_point_detail', { point_id: hit.id })
      .then(result => {
        const detail = result as MapMaskPoint
        detailCacheRef.current.set(hit.id, detail)
        if (detailRequestSequenceRef.current !== requestSequence) return
        const current = selectedPointRef.current
        if (current?.id !== hit.id) return
        const merged = { ...current, ...detail }
        selectedPointRef.current = merged
        setSelectedPoint(merged)
      })
      .catch(() => {
        if (detailRequestSequenceRef.current !== requestSequence) return
        if (selectedPointRef.current?.id !== hit.id) return
        setDetailError('点位详情加载失败，请稍后重试')
      })
      .finally(() => {
        if (detailRequestSequenceRef.current !== requestSequence) return
        if (selectedPointRef.current?.id === hit.id) setDetailLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!enabled || !isBigmapDisplay) return
    let disposed = false
    let inFlight = false
    const pollCursor = async () => {
      if (inFlight || disposed) return
      inFlight = true
      try {
        const cursor = await window.App.mapMaskOverlay?.getCursorPosition()
        if (disposed) return
        const now = Date.now()
        const card = detailCardRef.current?.getBoundingClientRect()
        const insideCard = Boolean(cursor && card &&
          cursor.x >= card.left && cursor.x <= card.right &&
          cursor.y >= card.top && cursor.y <= card.bottom)
        if (cardInteractiveRef.current !== insideCard) {
          cardInteractiveRef.current = insideCard
          setCardInteractive(insideCard)
        }
        if (insideCard) {
          hoverCandidateRef.current = null
          hoverLeftAtRef.current = null
          return
        }
        const hit = cursor && [...renderedPointsRef.current].reverse().find(point =>
          Math.hypot(point.screen_x - cursor.x, point.screen_y - cursor.y) <= 15
        )
        if (hit) {
          hoverLeftAtRef.current = null
          if (selectedPointRef.current?.id === hit.id) return
          if (hoverCandidateRef.current?.id !== hit.id) {
            hoverCandidateRef.current = { id: hit.id, since: now }
          } else if (now - hoverCandidateRef.current.since >= 120) {
            showDetail(hit)
          }
          return
        }
        hoverCandidateRef.current = null
        if (selectedPointRef.current) {
          hoverLeftAtRef.current ??= now
          if (now - hoverLeftAtRef.current >= 180) closeDetail()
        }
      } catch {
        // A temporarily unavailable overlay window should not affect game input.
      } finally {
        inFlight = false
      }
    }
    void pollCursor()
    const timer = window.setInterval(() => void pollCursor(), 50)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [closeDetail, enabled, isBigmapDisplay, showDetail])

  const detailImages = selectedPoint?.detail.images ?? []
  useLayoutEffect(() => {
    const card = detailCardRef.current
    if (!card) return
    const updateHeight = () => {
      const nextHeight = card.getBoundingClientRect().height
      setDetailCardHeight(previous =>
        Math.abs(previous - nextHeight) >= 1 ? nextHeight : previous
      )
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(card)
    return () => observer.disconnect()
  }, [selectedPoint])

  const detailWidth = Math.min(420, Math.max(260, overlaySize.width - 24))
  const detailLeft = selectedPoint
    ? Math.max(12, Math.min(selectedPoint.screen_x + 18, overlaySize.width - detailWidth - 12))
    : 12
  const detailTop = selectedPoint
    ? Math.max(12, Math.min(selectedPoint.screen_y - 30, overlaySize.height - detailCardHeight - 12))
    : 12

  return (
    <main className="pointer-events-none relative h-screen w-screen overflow-hidden bg-transparent">
      <MapMaskCanvas
        clipCircle={minimapClipCircle}
        compact={isMinimapDisplay}
        enabled={enabled}
        labels={labels}
        points={renderedPoints}
      />
      {overlayHint ? (
        <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md">
          {overlayHint}
        </div>
      ) : null}
      {minimapHint ? (
        <div
          className="absolute -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md"
          style={minimapHintPosition}
        >
          {minimapHint}
        </div>
      ) : null}
      {selectedPoint && isBigmapDisplay ? (
        <div className="absolute inset-0">
          <section
            aria-label="点位详情"
            className="pointer-events-auto absolute flex max-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-white/25 bg-slate-950/90 text-white shadow-2xl backdrop-blur-xl"
            ref={detailCardRef}
            style={{ left: detailLeft, top: detailTop, width: detailWidth }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">
                  {selectedPoint.detail.catalog_name ||
                    labels.find(label => label.id === selectedPoint.label_id)?.name ||
                    selectedPoint.name}
                </h2>
                <p className="mt-1 text-sm text-slate-200">
                  {selectedPoint.detail.location_description || selectedPoint.name}
                </p>
              </div>
              <button
                aria-label="关闭点位详情"
                className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={closeDetail}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto px-4 py-3 text-sm">
              {detailLoading ? <p className="text-slate-300">正在加载点位详情…</p> : null}
              {detailError ? <p className="text-amber-300">{detailError}</p> : null}
              {!detailLoading && !detailError ? (
                <>
                  {selectedPoint.detail.difficulty != null ? (
                    <p className="mb-3 text-amber-200">获取难度：{selectedPoint.detail.difficulty}</p>
                  ) : null}
                  {detailImages.length > 0 ? (
                    <div className="mb-3">
                      <img
                        alt={`${selectedPoint.name}位置示意图`}
                        className="max-h-[40vh] w-full rounded-lg bg-black/30 object-contain"
                        referrerPolicy="no-referrer"
                        src={detailImages[imageIndex]}
                      />
                      {detailImages.length > 1 ? (
                        <div className="mt-2 flex items-center justify-center gap-4 text-xs">
                          <button onClick={() => setImageIndex((imageIndex - 1 + detailImages.length) % detailImages.length)} type="button">上一张</button>
                          <span>{imageIndex + 1}/{detailImages.length}</span>
                          <button onClick={() => setImageIndex((imageIndex + 1) % detailImages.length)} type="button">下一张</button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-100">
                    {selectedPoint.detail.content || '暂无详细图文说明'}
                  </p>
                  {selectedPoint.detail.contributor ? (
                    <p className="mt-3 text-xs text-slate-400">贡献者：{selectedPoint.detail.contributor}</p>
                  ) : null}
                  {selectedPoint.detail.submitted_at || selectedPoint.detail.updated_at ? (
                    <p className="mt-1 text-xs text-slate-400">
                      更新时间：{String(selectedPoint.detail.submitted_at || selectedPoint.detail.updated_at).replace('T', ' ').slice(0, 19)}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
