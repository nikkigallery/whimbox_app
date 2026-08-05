import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Copy, Crosshair, Eye, EyeOff, Grid3X3, MapPinned, Plus, RefreshCw, SlidersHorizontal, Trash2, X } from 'lucide-react'

import { MapMaskCanvas } from 'renderer/components/map-mask/map-mask-canvas'
import { Button } from 'renderer/components/ui/button'
import { Checkbox } from 'renderer/components/ui/checkbox'
import { Input } from 'renderer/components/ui/input'
import { cn } from 'renderer/lib/utils'
import type {
  GameWindowBounds,
  MapMaskBigMapDetectionMode,
  MapMaskLabel,
  MapMaskLabelsResponse,
  MapMaskPoint,
  MapMaskPointDetail,
  MapMaskState,
  MapMaskViewport,
  MapMaskVisiblePointsResponse,
  VisibleMapMaskPoint,
} from 'renderer/types/map-mask'

type SetSelectedLabelsResponse = string[] | MapMaskLabelsResponse

type FloatingPoint = {
  point: VisibleMapMaskPoint
  x: number
  y: number
}

type CalibrationField =
  | 'screen_left'
  | 'screen_top'
  | 'screen_width'
  | 'screen_height'
  | 'image_left'
  | 'image_top'
  | 'image_width'
  | 'image_height'
  | 'scale'

type CalibrationJson = {
  screen_width: number
  screen_height: number
  map_area_left: number
  map_area_top: number
  map_area_width: number
  map_area_height: number
  map_image_left: number
  map_image_top: number
  map_image_width: number
  map_image_height: number
  zoom: number
  map_name: string
}

type LocalPointJson = {
  id: string
  label_id: string
  name: string
  map_name: string
  image_x: number
  image_y: number
  game_x: number | null
  game_y: number | null
  icon: string
  provider: string
  detail: MapMaskPointDetail
}

type MouseCalibrationInfo = {
  screenX: number
  screenY: number
  areaX: number
  areaY: number
  imageX: number
  imageY: number
  insideArea: boolean
}

type LastMapHoverCoordinate = {
  screen_x: number
  screen_y: number
  area_x: number
  area_y: number
  image_x: number
  image_y: number
  map_name: string
  viewport_id: string
  viewport_timestamp: string
}

type LandmarkCenterJson = {
  name: string
  web_x: null
  web_y: null
  game_image_x: number
  game_image_y: number
  expected_png_x: number
  expected_png_y: number
  accepted_center_x: number
  accepted_center_y: number
  nearest_loaded_point: {
    name: string
    image_x: number
    image_y: number
  }
  delta_to_nearest: {
    image_x: number
    image_y: number
    screen_x: number | null
    screen_y: number | null
  }
  viewport_source: string
  center_accept_reason: string
  accept_reason: string
  confidence: number
  fallback: false
  timestamp: string
}

type MapMaskDebugState = {
  enabled: boolean
  visibleCount: number
  selectedLabelIds: string[]
  labels: string[]
  hoverPointId: string | null
  selectedPointId: string | null
  detailPointId: string | null
  hasValidViewport: boolean
  isBigMapOpen: boolean
  viewportSource: string
  viewportFallbackReason: string
  viewportDetectionConfidence: number
  viewportDetectionError: string
  viewportCenterX: number | null
  viewportCenterY: number | null
  rawCenterX: number | null
  rawCenterY: number | null
  acceptedCenterX: number | null
  acceptedCenterY: number | null
  correctedCenterX: number | null
  correctedCenterY: number | null
  centerCorrectionSource: string
  nearestLoadedPointName: string
  pendingCenterX: number | null
  pendingCenterY: number | null
  centerJumpDistance: number | null
  centerAcceptReason: string
  centerRejectedReason: string
  pendingConfirmCount: number
  lastGoodCenterAgeMs: number | null
  smoothingMode: string
  smoothingApplied: boolean
  smoothingDistance: number | null
  snapReason: string
  trackingMode: string
  motionDiff: number | null
  motionUnstable: boolean
  motionStableCount: number
  candidateDistanceToLastGood: number | null
  localMatchConfidence: number | null
  globalMatchConfidence: number | null
  selectedMatchSource: string
  reacquirePendingCount: number
  trackingCenterX: number | null
  trackingCenterY: number | null
  globalCheckCenterX: number | null
  globalCheckCenterY: number | null
  globalCheckDelta: number | null
  trackingSuspect: boolean
  trackingResetReason: string
  mapScale: number | null
  assumesMaxBigmapZoom: boolean
  lastViewportUpdateTime: string
  viewportStale: boolean
  detectionSource: string
  rawIsBigMapOpen: boolean
  stableIsBigMapOpen: boolean
  consecutiveOpenCount: number
  consecutiveClosedCount: number
  draftLocalPointCount: number
  selectedDraftPointId: string | null
  lastMapHoverCoordinate: LastMapHoverCoordinate | null
  placementMode: boolean
  mapPointerInside: boolean
}

declare global {
  interface Window {
    __mapMaskDebugState?: MapMaskDebugState
  }
}

const defaultState: MapMaskState = {
  enabled: true,
  provider: 'local',
  fallback_provider: 'local',
  data_source: 'sample',
  labels_source: 'sample',
  points_source: 'sample',
  local_labels_path: '',
  local_points_path: '',
  local_labels_error: '',
  local_points_error: '',
  selected_label_ids: [],
  is_bigmap_open: true,
  has_valid_viewport: false,
  viewport: null,
  viewport_mode: 'sample',
  viewport_source: 'pending',
  viewport_fallback_used: false,
  viewport_fallback_reason: '',
  viewport_detection_confidence: 0,
  viewport_detection_error: '',
  viewport_center_x: null,
  viewport_center_y: null,
  raw_center_x: null,
  raw_center_y: null,
  accepted_center_x: null,
  accepted_center_y: null,
  corrected_center_x: null,
  corrected_center_y: null,
  center_correction_enabled: false,
  center_correction_scale_x: 1,
  center_correction_scale_y: 1,
  center_correction_offset_x: 0,
  center_correction_offset_y: 0,
  center_correction_source: 'disabled',
  nearest_loaded_point_id: '',
  nearest_loaded_point_name: '',
  nearest_loaded_point_image_x: null,
  nearest_loaded_point_image_y: null,
  nearest_loaded_point_distance: null,
  nearest_loaded_point_delta_image_x: null,
  nearest_loaded_point_delta_image_y: null,
  nearest_loaded_point_delta_screen_x: null,
  nearest_loaded_point_delta_screen_y: null,
  pending_center_x: null,
  pending_center_y: null,
  center_jump_distance: null,
  center_accept_reason: '',
  center_rejected_reason: '',
  pending_confirm_count: 0,
  last_good_center_age_ms: null,
  smoothing_mode: 'off',
  smoothing_applied: false,
  smoothing_distance: null,
  snap_reason: '',
  tracking_mode: 'idle',
  motion_diff: null,
  motion_unstable: false,
  motion_stable_count: 0,
  candidate_distance_to_last_good: null,
  local_match_confidence: null,
  global_match_confidence: null,
  selected_match_source: 'none',
  reacquire_pending_count: 0,
  tracking_center_x: null,
  tracking_center_y: null,
  global_check_center_x: null,
  global_check_center_y: null,
  global_check_delta: null,
  global_check_confidence: null,
  tracking_suspect: false,
  tracking_reset_reason: '',
  last_global_check_time: '',
  last_viewport_update_time: '',
  viewport_stale: false,
  viewport_calibration_path: '',
  viewport_calibration_error: '',
  viewport_screen_width: null,
  viewport_screen_height: null,
  map_scale: null,
  map_scale_source: '',
  viewport_span_source: 'manual-calibration',
  assumes_max_bigmap_zoom: false,
  detection_mode: 'auto',
  detection_source: 'pending',
  detection_confidence: 0,
  raw_is_bigmap_open: false,
  stable_is_bigmap_open: false,
  consecutive_open_count: 0,
  consecutive_closed_count: 0,
  detection_error: '',
  last_detection_time: '',
  last_successful_detection_time: '',
  detection_duration_ms: 0,
  detection_interval_ms: 500,
  stable_open_frames: 2,
  stable_closed_frames: 2,
}

const LOCAL_POINTS_STORAGE_KEY = 'whimbox.mapMask.localPointDrafts'
const LANDMARK_CENTER_CONFIDENCE_THRESHOLD = 0.35

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function describeBounds(bounds: GameWindowBounds | null) {
  if (!bounds) return 'bounds: pending'
  return `${bounds.appliedBoundsSource} ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`
}

function formatUpdateTime(value: string | undefined) {
  if (!value) return 'pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function formatRect(rect: GameWindowBounds['windowRect']) {
  if (!rect) return 'n/a'
  return `${rect.width}x${rect.height} at ${rect.x},${rect.y}`
}

function formatOverlayRect(bounds: GameWindowBounds | null) {
  if (!bounds?.overlay) return bounds ? `${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}` : 'pending'
  return `${bounds.overlay.width}x${bounds.overlay.height} at ${bounds.overlay.x},${bounds.overlay.y}`
}

function formatScale(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}x` : 'n/a'
}

function formatConfidence(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a'
}

function formatMs(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}ms` : 'n/a'
}

function landmarkCenterCopyState(state: MapMaskState): {
  value: LandmarkCenterJson | null
  disabledReason: string
} {
  const acceptedX = state.accepted_center_x
  const acceptedY = state.accepted_center_y
  const nearestX = state.nearest_loaded_point_image_x
  const nearestY = state.nearest_loaded_point_image_y
  if (state.viewport_fallback_used) {
    return { value: null, disabledReason: 'viewport is using calibration fallback' }
  }
  if (state.center_rejected_reason) {
    return { value: null, disabledReason: `center rejected: ${state.center_rejected_reason}` }
  }
  if (state.viewport_stale) {
    return { value: null, disabledReason: 'accepted center is stale' }
  }
  if (
    typeof acceptedX !== 'number' ||
    !Number.isFinite(acceptedX) ||
    typeof acceptedY !== 'number' ||
    !Number.isFinite(acceptedY)
  ) {
    return { value: null, disabledReason: 'accepted center is unavailable' }
  }
  if (!state.center_accept_reason) {
    return { value: null, disabledReason: 'center has not been accepted yet' }
  }
  if (state.viewport_detection_confidence < LANDMARK_CENTER_CONFIDENCE_THRESHOLD) {
    return {
      value: null,
      disabledReason: `confidence ${state.viewport_detection_confidence.toFixed(2)} is below ${LANDMARK_CENTER_CONFIDENCE_THRESHOLD.toFixed(2)}`,
    }
  }
  if (
    !state.nearest_loaded_point_name ||
    typeof nearestX !== 'number' ||
    !Number.isFinite(nearestX) ||
    typeof nearestY !== 'number' ||
    !Number.isFinite(nearestY)
  ) {
    return { value: null, disabledReason: 'nearest loaded point is unavailable' }
  }
  return {
    value: {
      name: state.nearest_loaded_point_name,
      web_x: null,
      web_y: null,
      game_image_x: acceptedX,
      game_image_y: acceptedY,
      expected_png_x: nearestX,
      expected_png_y: nearestY,
      accepted_center_x: acceptedX,
      accepted_center_y: acceptedY,
      nearest_loaded_point: {
        name: state.nearest_loaded_point_name,
        image_x: nearestX,
        image_y: nearestY,
      },
      delta_to_nearest: {
        image_x: state.nearest_loaded_point_delta_image_x ?? nearestX - acceptedX,
        image_y: state.nearest_loaded_point_delta_image_y ?? nearestY - acceptedY,
        screen_x: state.nearest_loaded_point_delta_screen_x,
        screen_y: state.nearest_loaded_point_delta_screen_y,
      },
      viewport_source: state.viewport_source,
      center_accept_reason: state.center_accept_reason,
      accept_reason: state.center_accept_reason,
      confidence: state.viewport_detection_confidence,
      fallback: false,
      timestamp: state.last_viewport_update_time || new Date().toISOString(),
    },
    disabledReason: '',
  }
}

function hasScreenCoords(point: MapMaskPoint | VisibleMapMaskPoint): point is VisibleMapMaskPoint {
  const candidate = point as Partial<VisibleMapMaskPoint>
  return typeof candidate.screen_x === 'number' && typeof candidate.screen_y === 'number'
}

function formatCoord(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '--'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidViewport(viewport: MapMaskState['viewport']): viewport is MapMaskViewport {
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
      isFiniteNumber(viewport.scale),
  )
}

function formatViewportRect(viewport: MapMaskState['viewport']) {
  if (!isValidViewport(viewport)) return 'n/a'
  return `${viewport.screen_width}x${viewport.screen_height} at ${viewport.screen_left},${viewport.screen_top}`
}

function formatImageRect(viewport: MapMaskState['viewport']) {
  if (!isValidViewport(viewport)) return 'n/a'
  return `${viewport.image_width.toFixed(1)}x${viewport.image_height.toFixed(1)} at ${viewport.image_left.toFixed(1)},${viewport.image_top.toFixed(1)}`
}

function viewportForOverlayCoordinates(
  viewport: MapMaskViewport | null,
  sourceScreenWidth: number | null | undefined,
  sourceScreenHeight: number | null | undefined,
  overlayWidth: number,
  overlayHeight: number,
): MapMaskViewport | null {
  if (!viewport) return null

  const inferredSourceWidth = Math.max(
    viewport.screen_width,
    viewport.screen_left + viewport.screen_width,
  )
  const inferredSourceHeight = Math.max(
    viewport.screen_height,
    viewport.screen_top + viewport.screen_height,
  )
  const sourceWidth = isFiniteNumber(sourceScreenWidth) && sourceScreenWidth > 0
    ? sourceScreenWidth
    : inferredSourceWidth
  const sourceHeight = isFiniteNumber(sourceScreenHeight) && sourceScreenHeight > 0
    ? sourceScreenHeight
    : inferredSourceHeight
  if (sourceWidth <= 0 || sourceHeight <= 0 || overlayWidth <= 0 || overlayHeight <= 0) {
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

function viewportToCalibrationJson(
  viewport: MapMaskViewport,
  bounds: GameWindowBounds | null,
): CalibrationJson {
  return {
    screen_width: Math.round(bounds?.width ?? viewport.screen_width),
    screen_height: Math.round(bounds?.height ?? viewport.screen_height),
    map_area_left: Math.round(viewport.screen_left),
    map_area_top: Math.round(viewport.screen_top),
    map_area_width: Math.round(viewport.screen_width),
    map_area_height: Math.round(viewport.screen_height),
    map_image_left: Number(viewport.image_left.toFixed(3)),
    map_image_top: Number(viewport.image_top.toFixed(3)),
    map_image_width: Number(viewport.image_width.toFixed(3)),
    map_image_height: Number(viewport.image_height.toFixed(3)),
    zoom: Number(viewport.scale.toFixed(4)),
    map_name: viewport.map_name,
  }
}

function computeMouseCalibrationInfo(
  viewport: MapMaskViewport | null,
  mousePosition: { x: number; y: number } | null,
): MouseCalibrationInfo | null {
  if (!viewport || !mousePosition) return null
  const areaX = mousePosition.x - viewport.screen_left
  const areaY = mousePosition.y - viewport.screen_top
  const relativeX = areaX / viewport.screen_width
  const relativeY = areaY / viewport.screen_height
  return {
    screenX: mousePosition.x,
    screenY: mousePosition.y,
    areaX,
    areaY,
    imageX: viewport.image_left + relativeX * viewport.image_width,
    imageY: viewport.image_top + relativeY * viewport.image_height,
    insideArea: relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1,
  }
}

function viewportIdentifier(viewport: MapMaskViewport) {
  return [
    viewport.map_name,
    viewport.screen_left,
    viewport.screen_top,
    viewport.screen_width,
    viewport.screen_height,
    viewport.image_left.toFixed(3),
    viewport.image_top.toFixed(3),
    viewport.image_width.toFixed(3),
    viewport.image_height.toFixed(3),
    viewport.scale.toFixed(4),
  ].join(':')
}

function toLastMapHoverCoordinate(
  viewport: MapMaskViewport,
  info: MouseCalibrationInfo,
): LastMapHoverCoordinate {
  return {
    screen_x: info.screenX,
    screen_y: info.screenY,
    area_x: Number(info.areaX.toFixed(3)),
    area_y: Number(info.areaY.toFixed(3)),
    image_x: Number(info.imageX.toFixed(3)),
    image_y: Number(info.imageY.toFixed(3)),
    map_name: viewport.map_name,
    viewport_id: viewportIdentifier(viewport),
    viewport_timestamp: new Date().toISOString(),
  }
}

function coordinateFromScreenPosition(
  viewport: MapMaskViewport | null,
  x: number,
  y: number,
): LastMapHoverCoordinate | null {
  const info = computeMouseCalibrationInfo(viewport, { x, y })
  if (!viewport || !info?.insideArea) return null
  return toLastMapHoverCoordinate(viewport, info)
}

function remapVisiblePoints(
  points: VisibleMapMaskPoint[],
  sourceViewport: MapMaskViewport | null,
  targetViewport: MapMaskViewport | null,
) {
  if (!sourceViewport || !targetViewport || sourceViewport === targetViewport) return points
  return points.flatMap((point) => {
    const imageX = sourceViewport.image_left
      + ((point.screen_x - sourceViewport.screen_left) / sourceViewport.screen_width) * sourceViewport.image_width
    const imageY = sourceViewport.image_top
      + ((point.screen_y - sourceViewport.screen_top) / sourceViewport.screen_height) * sourceViewport.image_height
    const relativeX = (imageX - targetViewport.image_left) / targetViewport.image_width
    const relativeY = (imageY - targetViewport.image_top) / targetViewport.image_height
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) return []
    return [{
      ...point,
      screen_x: targetViewport.screen_left + relativeX * targetViewport.screen_width,
      screen_y: targetViewport.screen_top + relativeY * targetViewport.screen_height,
    }]
  })
}

function visibleFromLocalPoint(
  point: MapMaskPoint,
  viewport: MapMaskViewport | null,
): VisibleMapMaskPoint | null {
  if (!viewport || viewport.image_width <= 0 || viewport.image_height <= 0) return null
  if (viewport.screen_width <= 0 || viewport.screen_height <= 0) return null
  if (point.map_name !== viewport.map_name) return null
  const relativeX = (point.image_x - viewport.image_left) / viewport.image_width
  const relativeY = (point.image_y - viewport.image_top) / viewport.image_height
  if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) return null
  return {
    ...point,
    screen_x: viewport.screen_left + relativeX * viewport.screen_width,
    screen_y: viewport.screen_top + relativeY * viewport.screen_height,
    is_visible: true,
  }
}

function pointToLocalJson(point: MapMaskPoint): LocalPointJson {
  return {
    id: point.id,
    label_id: point.label_id,
    name: point.name,
    map_name: point.map_name,
    image_x: Number(point.image_x.toFixed(3)),
    image_y: Number(point.image_y.toFixed(3)),
    game_x: point.game_x ?? null,
    game_y: point.game_y ?? null,
    icon: point.icon || `${point.label_id}.svg`,
    provider: 'local',
    detail: point.detail ?? {},
  }
}

function normalizeStoredLocalPoint(value: unknown): MapMaskPoint | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<MapMaskPoint>
  const imageX = Number(candidate.image_x)
  const imageY = Number(candidate.image_y)
  if (!candidate.id || !candidate.label_id || !candidate.name || !candidate.map_name) return null
  if (!Number.isFinite(imageX) || !Number.isFinite(imageY)) return null
  return {
    id: String(candidate.id),
    label_id: String(candidate.label_id),
    name: String(candidate.name),
    map_name: String(candidate.map_name),
    image_x: imageX,
    image_y: imageY,
    game_x: candidate.game_x ?? null,
    game_y: candidate.game_y ?? null,
    icon: candidate.icon || `${candidate.label_id}.svg`,
    provider: 'local',
    detail: candidate.detail ?? {},
  }
}

function loadStoredLocalPoints(): MapMaskPoint[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_POINTS_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.flatMap((item) => {
      const point = normalizeStoredLocalPoint(item)
      return point ? [point] : []
    })
  } catch {
    return []
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function MapMaskOverlayScreen() {
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const calibrationPanelRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const pointerPassthroughRef = useRef(true)
  const uiHoverRef = useRef(false)
  const markerHoverRef = useRef(false)
  const placementModeRef = useRef(false)
  const continuousPlacementRef = useRef(false)
  const mapPointerInsideRef = useRef(false)
  const ctrlMapAddArmedRef = useRef(false)

  const [labels, setLabels] = useState<MapMaskLabel[]>([])
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [visibleResult, setVisibleResult] = useState<MapMaskVisiblePointsResponse>({
    points: [],
    state: defaultState,
  })
  const [hoverPoint, setHoverPoint] = useState<FloatingPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<FloatingPoint | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<MapMaskPoint | null>(null)
  const [bounds, setBounds] = useState<GameWindowBounds | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [calibrationVisible, setCalibrationVisible] = useState(false)
  const [viewportDebugVisible, setViewportDebugVisible] = useState(false)
  const [calibrationPanelVisible, setCalibrationPanelVisible] = useState(false)
  const [samplePointsVisible, setSamplePointsVisible] = useState(true)
  const [calibrationDraft, setCalibrationDraft] = useState<MapMaskViewport | null>(null)
  const [localPointDrafts, setLocalPointDrafts] = useState<MapMaskPoint[]>(() => loadStoredLocalPoints())
  const [localPointsVisible, setLocalPointsVisible] = useState(true)
  const [localPointLabelId, setLocalPointLabelId] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [lastMapHoverCoordinate, setLastMapHoverCoordinate] = useState<LastMapHoverCoordinate | null>(null)
  const [placementMode, setPlacementMode] = useState(false)
  const [continuousPlacement, setContinuousPlacement] = useState(false)
  const [mapPointerInside, setMapPointerInside] = useState(false)
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

  const selectedSet = useMemo(() => new Set(selectedLabelIds), [selectedLabelIds])
  const labelById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels])
  const enabled = visibleResult.state.enabled
  const activeViewport = isValidViewport(visibleResult.state.viewport) ? visibleResult.state.viewport : null
  const calibrationViewport = calibrationDraft ?? activeViewport
  const projectionSourceViewport = visibleResult.state.viewport_mode.includes('auto-center')
    ? activeViewport
    : calibrationViewport
  const overlayViewport = useMemo(
    () => viewportForOverlayCoordinates(
      projectionSourceViewport,
      visibleResult.state.viewport_screen_width,
      visibleResult.state.viewport_screen_height,
      overlaySize.width,
      overlaySize.height,
    ),
    [
      overlaySize.height,
      overlaySize.width,
      projectionSourceViewport,
      visibleResult.state.viewport_screen_height,
      visibleResult.state.viewport_screen_width,
    ],
  )
  const calibrationJson = useMemo(
    () => (calibrationViewport ? viewportToCalibrationJson(calibrationViewport, bounds) : null),
    [bounds, calibrationViewport],
  )
  const landmarkCenterCopy = useMemo(
    () => landmarkCenterCopyState(visibleResult.state),
    [visibleResult.state],
  )
  const mouseCalibrationInfo = useMemo(
    () => computeMouseCalibrationInfo(overlayViewport, mousePosition),
    [mousePosition, overlayViewport],
  )
  const selectedDraftPoint = useMemo(
    () => localPointDrafts.find((point) => point.id === selectedPoint?.point.id) ?? null,
    [localPointDrafts, selectedPoint?.point.id],
  )
  const backendRenderedPoints = useMemo(() => {
    if (!samplePointsVisible) return []
    return remapVisiblePoints(visibleResult.points, activeViewport, overlayViewport)
  }, [activeViewport, overlayViewport, samplePointsVisible, visibleResult.points])
  const localRenderedPoints = useMemo(() => {
    if (!visibleResult.state.is_bigmap_open) return []
    if (!localPointsVisible) return []
    return localPointDrafts.flatMap((point) => {
      if (selectedSet.size > 0 && !selectedSet.has(point.label_id)) return []
      const visible = visibleFromLocalPoint(point, overlayViewport)
      return visible ? [visible] : []
    })
  }, [localPointDrafts, localPointsVisible, overlayViewport, selectedSet, visibleResult.state.is_bigmap_open])
  const renderedPoints = useMemo(
    () => [...backendRenderedPoints, ...localRenderedPoints],
    [backendRenderedPoints, localRenderedPoints],
  )
  const localPointsJson = useMemo(
    () => JSON.stringify(localPointDrafts.map((point) => pointToLocalJson(point)), null, 2),
    [localPointDrafts],
  )

  const setPointerPassthrough = useCallback((ignore: boolean) => {
    if (pointerPassthroughRef.current === ignore) return
    pointerPassthroughRef.current = ignore
    void window.App.mapMaskOverlay?.setIgnoreMouseEvents(ignore, { forward: true })
  }, [])

  const updatePointerMode = useCallback(() => {
    const shouldCapture =
      uiHoverRef.current ||
      markerHoverRef.current ||
      placementModeRef.current ||
      ctrlMapAddArmedRef.current
    setPointerPassthrough(!shouldCapture)
  }, [setPointerPassthrough])

  const refreshBounds = useCallback(async () => {
    const api = window.App.mapMaskOverlay
    if (!api) return
    const nextBounds = await api.syncToGameWindow()
    setBounds(nextBounds)
  }, [])

  const refreshLabels = useCallback(async () => {
    const result = await window.App.rpc.request('map_mask.get_labels') as MapMaskLabelsResponse
    setLabels(result.labels)
    setSelectedLabelIds(result.selected_label_ids)
  }, [])

  const refreshVisiblePoints = useCallback(async () => {
    const result = await window.App.rpc.request(
      'map_mask.get_visible_points',
    ) as MapMaskVisiblePointsResponse
    setVisibleResult(result)
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshLabels(), refreshVisiblePoints(), refreshBounds()])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }, [refreshBounds, refreshLabels, refreshVisiblePoints])

  useEffect(() => {
    document.documentElement.classList.add('overlay-window')
    document.body.classList.add('overlay-window')
    setPointerPassthrough(true)
    void window.App.mapMaskOverlay?.getDebugOptions().then((options) => {
      setCalibrationVisible(options.calibrationOverlayEnabled)
      setViewportDebugVisible(options.viewportDebugEnabled)
    })
    void refreshAll()

    const timer = window.setInterval(() => {
      void refreshVisiblePoints().catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      void refreshBounds().catch(() => {})
    }, 800)

    return () => {
      window.clearInterval(timer)
      document.documentElement.classList.remove('overlay-window')
      document.body.classList.remove('overlay-window')
      setPointerPassthrough(false)
    }
  }, [refreshAll, refreshBounds, refreshVisiblePoints, setPointerPassthrough])

  useEffect(() => {
    placementModeRef.current = placementMode
    updatePointerMode()
  }, [placementMode, updatePointerMode])

  useEffect(() => {
    continuousPlacementRef.current = continuousPlacement
  }, [continuousPlacement])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const nextMousePosition = { x: event.clientX, y: event.clientY }
      setMousePosition(nextMousePosition)
      const inToolbar = isInside(toolbarRef.current, event.clientX, event.clientY)
      const inCalibrationPanel = isInside(calibrationPanelRef.current, event.clientX, event.clientY)
      const inPopup = isInside(popupRef.current, event.clientX, event.clientY)
      uiHoverRef.current = inToolbar || inCalibrationPanel || inPopup
      const info = computeMouseCalibrationInfo(overlayViewport, nextMousePosition)
      const insideMap = Boolean(!uiHoverRef.current && overlayViewport && info?.insideArea)
      mapPointerInsideRef.current = insideMap
      ctrlMapAddArmedRef.current = Boolean(insideMap && event.ctrlKey)
      setMapPointerInside(insideMap)
      if (insideMap && overlayViewport && info) {
        setLastMapHoverCoordinate(toLastMapHoverCoordinate(overlayViewport, info))
      }
      updatePointerMode()
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [overlayViewport, updatePointerMode])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LOCAL_POINTS_STORAGE_KEY,
        JSON.stringify(localPointDrafts.map((point) => pointToLocalJson(point))),
      )
    } catch {
      // local draft persistence is best-effort only.
    }
  }, [localPointDrafts])

  useEffect(() => {
    if (localPointLabelId && labels.some((label) => label.id === localPointLabelId)) return
    const defaultLabel =
      labels.find((label) => label.id === 'local_marker') ??
      labels.find((label) => selectedSet.has(label.id)) ??
      labels[0]
    if (defaultLabel) {
      setLocalPointLabelId(defaultLabel.id)
    }
  }, [labels, localPointLabelId, selectedSet])

  const handleSetEnabled = useCallback(
    async (nextEnabled: boolean) => {
      try {
        const nextState = await window.App.rpc.request('map_mask.set_enabled', {
          enabled: nextEnabled,
        }) as MapMaskState
        setVisibleResult((prev) => ({ ...prev, state: nextState }))
        await refreshVisiblePoints()
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refreshVisiblePoints],
  )

  const handleSetBigMapDetectionMode = useCallback(
    async (mode: MapMaskBigMapDetectionMode) => {
      try {
        const nextState = await window.App.rpc.request('map_mask.set_bigmap_detection_mode', {
          mode,
        }) as MapMaskState
        setVisibleResult((prev) => ({ ...prev, state: nextState }))
        await refreshVisiblePoints()
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refreshVisiblePoints],
  )

  const handleToggleLabel = useCallback(
    async (labelId: string) => {
      const nextSelected = selectedSet.has(labelId)
        ? selectedLabelIds.filter((id) => id !== labelId)
        : [...selectedLabelIds, labelId]
      setSelectedLabelIds(nextSelected)
      try {
        const saved = await window.App.rpc.request('map_mask.set_selected_labels', {
          label_ids: nextSelected,
        }) as SetSelectedLabelsResponse
        if (Array.isArray(saved)) {
          setSelectedLabelIds(saved)
        } else {
          setSelectedLabelIds(saved.selected_label_ids)
          setLabels(saved.labels)
        }
        await refreshVisiblePoints()
        setError('')
      } catch (err) {
        setSelectedLabelIds(selectedLabelIds)
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refreshVisiblePoints, selectedLabelIds, selectedSet],
  )

  const handleCopyCalibrationJson = useCallback(async () => {
    if (!calibrationJson) return
    try {
      await copyText(JSON.stringify(calibrationJson, null, 2))
      setCopyMessage('calibration JSON copied')
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err))
    }
  }, [calibrationJson])

  const handleCopyMouseCoordinates = useCallback(async () => {
    const coordinates = lastMapHoverCoordinate ?? mouseCalibrationInfo
    if (!coordinates) return
    try {
      await copyText(JSON.stringify(coordinates, null, 2))
      setCopyMessage('mouse coordinates copied')
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err))
    }
  }, [lastMapHoverCoordinate, mouseCalibrationInfo])

  const handleCopyLandmarkCenter = useCallback(async () => {
    if (!landmarkCenterCopy.value) {
      setCopyMessage(landmarkCenterCopy.disabledReason || 'accepted center unavailable')
      return
    }
    try {
      await copyText(JSON.stringify(landmarkCenterCopy.value, null, 2))
      setCopyMessage('landmark center copied')
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err))
    }
  }, [landmarkCenterCopy])

  const addLocalPointAtCoordinate = useCallback((coordinate: LastMapHoverCoordinate, source: string) => {
    const label =
      labelById.get(localPointLabelId) ??
      labels.find((item) => item.id === 'local_marker') ??
      labels[0]
    const labelId = label?.id ?? 'local_marker'
    const nextIndex = localPointDrafts.length + 1
    const id = `local_${Date.now()}_${nextIndex}`
    const point: MapMaskPoint = {
      id,
      label_id: labelId,
      name: `Local Point ${nextIndex}`,
      map_name: coordinate.map_name,
      image_x: coordinate.image_x,
      image_y: coordinate.image_y,
      game_x: null,
      game_y: null,
      icon: label?.icon || `${labelId}.svg`,
      provider: 'local',
      detail: {
        description: `Added from ${source} at image ${coordinate.image_x.toFixed(1)},${coordinate.image_y.toFixed(1)}`,
        images: [],
      },
    }
    setLocalPointDrafts((points) => [...points, point])
    setLocalPointsVisible(true)
    if (selectedSet.size > 0 && !selectedSet.has(labelId)) {
      const nextSelected = [...selectedLabelIds, labelId]
      setSelectedLabelIds(nextSelected)
      void window.App.rpc.request('map_mask.set_selected_labels', {
        label_ids: nextSelected,
      }).catch(() => {})
    }
    const visiblePoint = visibleFromLocalPoint(point, overlayViewport)
    if (visiblePoint) {
      setSelectedPoint({
        point: visiblePoint,
        x: visiblePoint.screen_x,
        y: visiblePoint.screen_y,
      })
      setSelectedDetail(point)
    }
    setCopyMessage(`added ${point.name}`)
  }, [
    overlayViewport,
    labelById,
    labels,
    localPointDrafts.length,
    localPointLabelId,
    selectedLabelIds,
    selectedSet,
  ])

  const handleAddLocalPoint = useCallback(() => {
    if (!lastMapHoverCoordinate) {
      setCopyMessage('请先把鼠标移到地图区域')
      return
    }
    addLocalPointAtCoordinate(lastMapHoverCoordinate, 'last hovered map position')
  }, [addLocalPointAtCoordinate, lastMapHoverCoordinate])

  const setPlacementModeEnabled = useCallback((nextMode: boolean) => {
    placementModeRef.current = nextMode
    setPlacementMode(nextMode)
    setCopyMessage(nextMode ? '点击地图添加点位，Esc 取消' : 'placement mode canceled')
    updatePointerMode()
  }, [updatePointerMode])

  const handleTogglePlacementMode = useCallback(() => {
    setPlacementModeEnabled(!placementModeRef.current)
  }, [setPlacementModeEnabled])

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      const inToolbar = isInside(toolbarRef.current, event.clientX, event.clientY)
      const inCalibrationPanel = isInside(calibrationPanelRef.current, event.clientX, event.clientY)
      const inPopup = isInside(popupRef.current, event.clientX, event.clientY)
      if (inToolbar || inCalibrationPanel || inPopup) return

      const coordinate = coordinateFromScreenPosition(overlayViewport, event.clientX, event.clientY)
      if (!coordinate) {
        if (placementModeRef.current) setCopyMessage('请把鼠标移到地图区域')
        return
      }

      if (!placementModeRef.current && !event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      setLastMapHoverCoordinate(coordinate)
      addLocalPointAtCoordinate(coordinate, event.ctrlKey ? 'Ctrl + map click' : 'placement click')
      if (placementModeRef.current && !continuousPlacementRef.current) {
        setPlacementModeEnabled(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown, true)
    return () => window.removeEventListener('mousedown', handleMouseDown, true)
  }, [addLocalPointAtCoordinate, overlayViewport, setPlacementModeEnabled])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' && mapPointerInsideRef.current) {
        ctrlMapAddArmedRef.current = true
        updatePointerMode()
        return
      }
      if (isEditableKeyboardTarget(event.target)) return
      if (event.key === 'Escape') {
        if (placementModeRef.current) {
          event.preventDefault()
          setPlacementModeEnabled(false)
        }
        return
      }
      const isAddKey = event.key === 'Enter' || event.key.toLowerCase() === 'a'
      if (!isAddKey) return
      if (!mapPointerInsideRef.current || !lastMapHoverCoordinate) {
        if (placementModeRef.current) setCopyMessage('请把鼠标移到地图区域')
        return
      }
      event.preventDefault()
      addLocalPointAtCoordinate(lastMapHoverCoordinate, event.key === 'Enter' ? 'Enter key' : 'A key')
      if (placementModeRef.current && !continuousPlacementRef.current) {
        setPlacementModeEnabled(false)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control') return
      ctrlMapAddArmedRef.current = false
      updatePointerMode()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [addLocalPointAtCoordinate, lastMapHoverCoordinate, setPlacementModeEnabled, updatePointerMode])

  const handleUpdateLocalPoint = useCallback((pointId: string, patch: Partial<MapMaskPoint>) => {
    setLocalPointDrafts((points) => points.map((point) => (
      point.id === pointId
        ? {
            ...point,
            ...patch,
            icon: patch.label_id ? `${patch.label_id}.svg` : patch.icon ?? point.icon,
          }
        : point
    )))
  }, [])

  const handleDeleteLocalPoint = useCallback((pointId: string) => {
    setLocalPointDrafts((points) => points.filter((point) => point.id !== pointId))
    if (selectedPoint?.point.id === pointId) {
      setSelectedPoint(null)
      setSelectedDetail(null)
      markerHoverRef.current = false
      updatePointerMode()
    }
    setCopyMessage('local point removed')
  }, [selectedPoint?.point.id, updatePointerMode])

  const handleDeleteSelectedDraftPoint = useCallback(() => {
    if (!selectedDraftPoint) return
    handleDeleteLocalPoint(selectedDraftPoint.id)
  }, [handleDeleteLocalPoint, selectedDraftPoint])

  const handleClearLocalPoints = useCallback(() => {
    setLocalPointDrafts([])
    if (selectedDraftPoint) {
      setSelectedPoint(null)
      setSelectedDetail(null)
      markerHoverRef.current = false
      updatePointerMode()
    }
    setCopyMessage('draft local points cleared')
  }, [selectedDraftPoint, updatePointerMode])

  const handleCopyLocalPointsJson = useCallback(async () => {
    try {
      await copyText(localPointsJson)
      setCopyMessage('points.local.json copied')
    } catch (err) {
      setCopyMessage(err instanceof Error ? err.message : String(err))
    }
  }, [localPointsJson])

  const handleCalibrationFieldChange = useCallback(
    (field: CalibrationField, rawValue: string) => {
      const base = calibrationViewport ?? activeViewport
      if (!base) return
      const value = Number(rawValue)
      if (!Number.isFinite(value)) return
      const integerFields = new Set<CalibrationField>([
        'screen_left',
        'screen_top',
        'screen_width',
        'screen_height',
      ])
      const nextValue = integerFields.has(field) ? Math.round(value) : value
      setCalibrationDraft({ ...base, [field]: nextValue })
    },
    [activeViewport, calibrationViewport],
  )

  const handlePointHover = useCallback(
    (point: VisibleMapMaskPoint | null, position: { x: number; y: number } | null) => {
      markerHoverRef.current = Boolean(point)
      updatePointerMode()
      if (!point || !position) {
        setHoverPoint(null)
        return
      }
      setHoverPoint({ point, x: position.x, y: position.y })
    },
    [updatePointerMode],
  )

  const handlePointClick = useCallback(
    async (point: VisibleMapMaskPoint, position: { x: number; y: number }) => {
      setSelectedPoint({ point, x: position.x, y: position.y })
      markerHoverRef.current = true
      updatePointerMode()
      const draftPoint = localPointDrafts.find((item) => item.id === point.id)
      if (draftPoint) {
        setSelectedDetail(draftPoint)
        setError('')
        return
      }
      try {
        const detail = await window.App.rpc.request('map_mask.get_point_detail', {
          point_id: point.id,
        }) as MapMaskPoint
        setSelectedDetail(detail)
        setError('')
      } catch (err) {
        setSelectedDetail(null)
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [localPointDrafts, updatePointerMode],
  )

  const detailPoint = useMemo(() => {
    if (!selectedPoint) return selectedDetail
    if (!selectedDetail) return selectedPoint.point
    return {
      ...selectedPoint.point,
      ...selectedDetail,
      image_x: selectedPoint.point.image_x,
      image_y: selectedPoint.point.image_y,
      game_x: selectedPoint.point.game_x,
      game_y: selectedPoint.point.game_y,
      screen_x: selectedPoint.point.screen_x,
      screen_y: selectedPoint.point.screen_y,
    } as VisibleMapMaskPoint
  }, [selectedDetail, selectedPoint])
  const detailPosition = selectedPoint
    ? {
        left: clamp(selectedPoint.x + 16, 12, window.innerWidth - 292),
        top: clamp(selectedPoint.y - 24, 12, window.innerHeight - 220),
      }
    : null
  const hoverPosition = hoverPoint && !selectedPoint
    ? {
        left: clamp(hoverPoint.x + 12, 12, window.innerWidth - 240),
        top: clamp(hoverPoint.y + 12, 12, window.innerHeight - 96),
      }
    : null

  useEffect(() => {
    const visiblePointIds = new Set(renderedPoints.map((point) => point.id))
    if (hoverPoint && !visiblePointIds.has(hoverPoint.point.id)) {
      setHoverPoint(null)
      markerHoverRef.current = false
    }
    if (selectedPoint && !visiblePointIds.has(selectedPoint.point.id)) {
      setSelectedPoint(null)
      setSelectedDetail(null)
      markerHoverRef.current = false
    }
    updatePointerMode()
  }, [hoverPoint, renderedPoints, selectedPoint, updatePointerMode])

  useEffect(() => {
    window.__mapMaskDebugState = {
      enabled,
      visibleCount: renderedPoints.length,
      selectedLabelIds,
      labels: labels.map((label) => label.id),
      hoverPointId: hoverPoint?.point.id ?? null,
      selectedPointId: selectedPoint?.point.id ?? null,
      detailPointId: detailPoint?.id ?? null,
      hasValidViewport: visibleResult.state.has_valid_viewport,
      isBigMapOpen: visibleResult.state.is_bigmap_open,
      viewportSource: visibleResult.state.viewport_source,
      viewportFallbackReason: visibleResult.state.viewport_fallback_reason,
      viewportDetectionConfidence: visibleResult.state.viewport_detection_confidence,
      viewportDetectionError: visibleResult.state.viewport_detection_error,
      viewportCenterX: visibleResult.state.viewport_center_x,
      viewportCenterY: visibleResult.state.viewport_center_y,
      rawCenterX: visibleResult.state.raw_center_x,
      rawCenterY: visibleResult.state.raw_center_y,
      acceptedCenterX: visibleResult.state.accepted_center_x,
      acceptedCenterY: visibleResult.state.accepted_center_y,
      correctedCenterX: visibleResult.state.corrected_center_x,
      correctedCenterY: visibleResult.state.corrected_center_y,
      centerCorrectionSource: visibleResult.state.center_correction_source,
      nearestLoadedPointName: visibleResult.state.nearest_loaded_point_name,
      pendingCenterX: visibleResult.state.pending_center_x,
      pendingCenterY: visibleResult.state.pending_center_y,
      centerJumpDistance: visibleResult.state.center_jump_distance,
      centerAcceptReason: visibleResult.state.center_accept_reason,
      centerRejectedReason: visibleResult.state.center_rejected_reason,
      pendingConfirmCount: visibleResult.state.pending_confirm_count,
      lastGoodCenterAgeMs: visibleResult.state.last_good_center_age_ms,
      smoothingMode: visibleResult.state.smoothing_mode,
      smoothingApplied: visibleResult.state.smoothing_applied,
      smoothingDistance: visibleResult.state.smoothing_distance,
      snapReason: visibleResult.state.snap_reason,
      trackingMode: visibleResult.state.tracking_mode,
      motionDiff: visibleResult.state.motion_diff,
      motionUnstable: visibleResult.state.motion_unstable,
      motionStableCount: visibleResult.state.motion_stable_count,
      candidateDistanceToLastGood: visibleResult.state.candidate_distance_to_last_good,
      localMatchConfidence: visibleResult.state.local_match_confidence,
      globalMatchConfidence: visibleResult.state.global_match_confidence,
      selectedMatchSource: visibleResult.state.selected_match_source,
      reacquirePendingCount: visibleResult.state.reacquire_pending_count,
      trackingCenterX: visibleResult.state.tracking_center_x,
      trackingCenterY: visibleResult.state.tracking_center_y,
      globalCheckCenterX: visibleResult.state.global_check_center_x,
      globalCheckCenterY: visibleResult.state.global_check_center_y,
      globalCheckDelta: visibleResult.state.global_check_delta,
      trackingSuspect: visibleResult.state.tracking_suspect,
      trackingResetReason: visibleResult.state.tracking_reset_reason,
      mapScale: visibleResult.state.map_scale,
      assumesMaxBigmapZoom: visibleResult.state.assumes_max_bigmap_zoom,
      lastViewportUpdateTime: visibleResult.state.last_viewport_update_time,
      viewportStale: visibleResult.state.viewport_stale,
      detectionSource: visibleResult.state.detection_source,
      rawIsBigMapOpen: visibleResult.state.raw_is_bigmap_open,
      stableIsBigMapOpen: visibleResult.state.stable_is_bigmap_open,
      consecutiveOpenCount: visibleResult.state.consecutive_open_count,
      consecutiveClosedCount: visibleResult.state.consecutive_closed_count,
      draftLocalPointCount: localPointDrafts.length,
      selectedDraftPointId: selectedDraftPoint?.id ?? null,
      lastMapHoverCoordinate,
      placementMode,
      mapPointerInside,
    }
  }, [
    detailPoint?.id,
    enabled,
    hoverPoint?.point.id,
    lastMapHoverCoordinate,
    labels,
    localPointDrafts.length,
    mapPointerInside,
    placementMode,
    selectedLabelIds,
    selectedDraftPoint?.id,
    selectedPoint?.point.id,
    renderedPoints.length,
    visibleResult.state.consecutive_closed_count,
    visibleResult.state.consecutive_open_count,
    visibleResult.state.accepted_center_x,
    visibleResult.state.accepted_center_y,
    visibleResult.state.corrected_center_x,
    visibleResult.state.corrected_center_y,
    visibleResult.state.center_correction_source,
    visibleResult.state.candidate_distance_to_last_good,
    visibleResult.state.center_accept_reason,
    visibleResult.state.center_jump_distance,
    visibleResult.state.center_rejected_reason,
    visibleResult.state.detection_source,
    visibleResult.state.has_valid_viewport,
    visibleResult.state.is_bigmap_open,
    visibleResult.state.last_good_center_age_ms,
    visibleResult.state.last_viewport_update_time,
    visibleResult.state.local_match_confidence,
    visibleResult.state.global_match_confidence,
    visibleResult.state.motion_diff,
    visibleResult.state.motion_stable_count,
    visibleResult.state.motion_unstable,
    visibleResult.state.nearest_loaded_point_name,
    visibleResult.state.pending_center_x,
    visibleResult.state.pending_center_y,
    visibleResult.state.pending_confirm_count,
    visibleResult.state.raw_center_x,
    visibleResult.state.raw_center_y,
    visibleResult.state.raw_is_bigmap_open,
    visibleResult.state.reacquire_pending_count,
    visibleResult.state.tracking_center_x,
    visibleResult.state.tracking_center_y,
    visibleResult.state.global_check_center_x,
    visibleResult.state.global_check_center_y,
    visibleResult.state.global_check_delta,
    visibleResult.state.tracking_suspect,
    visibleResult.state.tracking_reset_reason,
    visibleResult.state.map_scale,
    visibleResult.state.assumes_max_bigmap_zoom,
    visibleResult.state.selected_match_source,
    visibleResult.state.smoothing_applied,
    visibleResult.state.smoothing_distance,
    visibleResult.state.smoothing_mode,
    visibleResult.state.snap_reason,
    visibleResult.state.stable_is_bigmap_open,
    visibleResult.state.tracking_mode,
    visibleResult.state.viewport_center_x,
    visibleResult.state.viewport_center_y,
    visibleResult.state.viewport_detection_confidence,
    visibleResult.state.viewport_detection_error,
    visibleResult.state.viewport_fallback_reason,
    visibleResult.state.viewport_source,
    visibleResult.state.viewport_stale,
  ])

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-transparent"
      data-testid="map-mask-overlay"
      data-detail-point-id={detailPoint?.id ?? ''}
      data-enabled={String(enabled)}
      data-has-valid-viewport={String(visibleResult.state.has_valid_viewport)}
      data-hover-point-id={hoverPoint?.point.id ?? ''}
      data-is-bigmap-open={String(visibleResult.state.is_bigmap_open)}
      data-label-ids={labels.map((label) => label.id).join(',')}
      data-selected-label-ids={selectedLabelIds.join(',')}
      data-selected-point-id={selectedPoint?.point.id ?? ''}
      data-visible-count={renderedPoints.length}
      data-viewport-source={visibleResult.state.viewport_source}
      data-detection-source={visibleResult.state.detection_source}
      data-raw-is-bigmap-open={String(visibleResult.state.raw_is_bigmap_open)}
      data-stable-is-bigmap-open={String(visibleResult.state.stable_is_bigmap_open)}
    >
      <MapMaskCanvas
        points={renderedPoints}
        labels={labels}
        viewport={overlayViewport}
        enabled={enabled}
        selectedPointId={selectedPoint?.point.id ?? null}
        onPointHover={handlePointHover}
        onPointClick={handlePointClick}
      />

      <div
        ref={toolbarRef}
        className="absolute left-4 top-4 z-20 w-[min(420px,calc(100vw-32px))] rounded-lg border border-white/14 bg-slate-950/72 p-3 text-white shadow-xl backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-pink-400/22 text-pink-200">
              <MapPinned className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Map Mask</p>
              <p className="truncate text-[11px] text-white/55">
                {renderedPoints.length} visible / {labels.length} labels
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => void handleSetEnabled(!enabled)}
              title={enabled ? 'Disable' : 'Enable'}
            >
              {enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => setCalibrationVisible((value) => !value)}
              title="Toggle calibration overlay"
            >
              <Crosshair className={cn('size-4', calibrationVisible && 'text-lime-300')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => setViewportDebugVisible((value) => !value)}
              title="Toggle viewport debug grid"
            >
              <Grid3X3 className={cn('size-4', viewportDebugVisible && 'text-cyan-300')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => setSamplePointsVisible((value) => !value)}
              title="Toggle backend points"
            >
              {samplePointsVisible ? <Eye className="size-4 text-sky-200" /> : <EyeOff className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => setLocalPointsVisible((value) => !value)}
              title="Toggle draft local points"
            >
              {localPointsVisible ? <Eye className="size-4 text-emerald-200" /> : <EyeOff className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(
                'rounded-md text-white/75 hover:bg-white/10 hover:text-white',
                placementMode && 'bg-amber-300/14 text-amber-100',
              )}
              onClick={handleTogglePlacementMode}
              title={placementMode ? 'Cancel point placement' : 'Add Point'}
            >
              <Plus className={cn('size-4', placementMode && 'text-amber-200')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => setCalibrationPanelVisible((value) => !value)}
              title="Toggle calibration panel"
            >
              <SlidersHorizontal className={cn('size-4', calibrationPanelVisible && 'text-amber-200')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => void handleCopyCalibrationJson()}
              disabled={!calibrationJson}
              title="Copy calibration JSON"
            >
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              title="Refresh"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              onClick={() => void window.App.mapMaskOverlay?.hide()}
              title="Hide overlay"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {labels.map((label) => (
            <label
              key={label.id}
              data-map-mask-label-id={label.id}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/7 px-2 py-1.5 text-xs text-white/78 transition hover:bg-white/12"
            >
              <Checkbox
                checked={selectedSet.has(label.id)}
                onCheckedChange={() => void handleToggleLabel(label.id)}
                className="border-white/35 bg-white/8"
              />
              <span className="truncate">{label.name}</span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex rounded-md border border-white/10 bg-white/7 p-1">
          {([
            ['auto', 'Auto Detect'],
            ['force-open', 'Force Open'],
            ['force-closed', 'Force Closed'],
          ] as const).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              data-map-mask-bigmap-mode={mode}
              variant="ghost"
              size="xs"
              className={cn(
                'min-w-0 flex-1 rounded px-1.5 text-[11px] text-white/62 hover:bg-white/10 hover:text-white',
                visibleResult.state.detection_mode === mode && 'bg-white/15 text-white',
              )}
              onClick={() => void handleSetBigMapDetectionMode(mode)}
            >
              <span className="truncate">{label}</span>
            </Button>
          ))}
        </div>

        <div className="mt-3 space-y-1 text-[11px] text-white/50">
          <p className="truncate">
            bigmap: {visibleResult.state.is_bigmap_open ? 'open' : 'closed'} / rendered:{' '}
            {renderedPoints.length}
          </p>
          <p className="truncate">
            data: {visibleResult.state.data_source} / labels:{' '}
            {visibleResult.state.labels_source} / points: {visibleResult.state.points_source}
          </p>
          <p className="truncate">
            local points: draft {localPointDrafts.length} / shown {localRenderedPoints.length}
            {localPointsVisible ? '' : ' / hidden'}
          </p>
          <p className="truncate">
            placement: {placementMode ? 'active' : 'off'} / pointer:{' '}
            {mapPointerInside ? 'map' : 'outside'}
          </p>
          <p className="truncate">
            selected draft: {selectedDraftPoint?.id ?? 'none'}
          </p>
          <p className="truncate">
            last map hover:{' '}
            {lastMapHoverCoordinate
              ? `${lastMapHoverCoordinate.screen_x},${lastMapHoverCoordinate.screen_y}`
              : 'none'}
          </p>
          <p className="truncate">
            hover image:{' '}
            {lastMapHoverCoordinate
              ? `${lastMapHoverCoordinate.image_x.toFixed(1)},${lastMapHoverCoordinate.image_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            points path: {visibleResult.state.local_points_path || 'sample fallback'}
          </p>
          <p className="truncate">
            raw/stable:{' '}
            {visibleResult.state.raw_is_bigmap_open ? 'open' : 'closed'} /{' '}
            {visibleResult.state.stable_is_bigmap_open ? 'open' : 'closed'}
          </p>
          <p className="truncate">
            stable frames: {visibleResult.state.consecutive_open_count}/
            {visibleResult.state.stable_open_frames} open,{' '}
            {visibleResult.state.consecutive_closed_count}/
            {visibleResult.state.stable_closed_frames} closed
          </p>
          <p className="truncate">source: {bounds?.source ?? 'pending'} / {bounds?.appliedBoundsSource ?? 'pending'}</p>
          <p className="truncate">
            tracker: {bounds?.trackerMode ?? 'pending'}
            {bounds?.isGameWindowFound ? ' / found' : ' / fallback'}
            {bounds?.isMinimized ? ' / minimized' : ''}
          </p>
          <p className="truncate">
            matchedBy: {bounds?.matchedBy ?? 'pending'}
          </p>
          <p className="truncate">
            process: {bounds?.processName ?? 'n/a'} / pid: {bounds?.pid ?? 'n/a'}
          </p>
          <p className="truncate">
            hwnd: {bounds?.foundWindowHandle ?? 'n/a'}
          </p>
          <p className="truncate">
            windowTitle: {bounds?.foundWindowTitle ?? 'not found'}
          </p>
          <p className="truncate">window rect: {formatRect(bounds?.windowRect ?? null)}</p>
          <p className="truncate">client rect: {formatRect(bounds?.clientRect ?? null)}</p>
          <p className="truncate">overlay: {formatOverlayRect(bounds)}</p>
          <p className="truncate">dpi: {formatScale(bounds?.dpiScale)} / scale: {formatScale(bounds?.scaleFactor)}</p>
          <p className="truncate">applied: {describeBounds(bounds)}</p>
          <p className="truncate">
            updated: {formatUpdateTime(bounds?.lastUpdateTime)}
          </p>
          <p className="truncate">
            tracker poll: {bounds?.trackerIntervalMs ?? 'n/a'}ms / duration:{' '}
            {bounds ? bounds.lastUpdateDurationMs.toFixed(1) : 'n/a'}ms / changed:{' '}
            {bounds ? String(bounds.lastBoundsChanged) : 'n/a'}
          </p>
          <p className="truncate">
            viewport:{' '}
            {visibleResult.state.has_valid_viewport
              ? activeViewport?.map_name ?? 'valid'
              : 'fallback unavailable'}
            {' / '}
            {visibleResult.state.viewport_source}
          </p>
          <p className="truncate">
            viewport mode: {visibleResult.state.viewport_mode}
            {visibleResult.state.viewport_fallback_used ? ' / fallback' : ''}
          </p>
          <p className="truncate">
            viewport center:{' '}
            {visibleResult.state.viewport_center_x !== null && visibleResult.state.viewport_center_y !== null
              ? `${visibleResult.state.viewport_center_x.toFixed(1)},${visibleResult.state.viewport_center_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            raw center:{' '}
            {visibleResult.state.raw_center_x !== null && visibleResult.state.raw_center_y !== null
              ? `${visibleResult.state.raw_center_x.toFixed(1)},${visibleResult.state.raw_center_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            accepted center:{' '}
            {visibleResult.state.accepted_center_x !== null &&
            visibleResult.state.accepted_center_y !== null
              ? `${visibleResult.state.accepted_center_x.toFixed(1)},${visibleResult.state.accepted_center_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            corrected center:{' '}
            {formatCoord(visibleResult.state.corrected_center_x)},
            {formatCoord(visibleResult.state.corrected_center_y)}
          </p>
          <p className="truncate">
            center correction: {visibleResult.state.center_correction_source || 'disabled'}
            {visibleResult.state.center_correction_enabled ? ' / enabled' : ' / disabled'}
            {visibleResult.state.center_correction_enabled ? ' / experimental' : ''}
          </p>
          <p className="truncate">
            map scale: {formatScale(visibleResult.state.map_scale)} / source:{' '}
            {visibleResult.state.map_scale_source || 'n/a'} / span:{' '}
            {visibleResult.state.viewport_span_source}
          </p>
          {visibleResult.state.assumes_max_bigmap_zoom ? (
            <p className="truncate text-amber-200">
              Assumes max bigmap zoom / map_scale={formatScale(visibleResult.state.map_scale)}
            </p>
          ) : null}
          <p className="truncate">
            pending center:{' '}
            {visibleResult.state.pending_center_x !== null &&
            visibleResult.state.pending_center_y !== null
              ? `${visibleResult.state.pending_center_x.toFixed(1)},${visibleResult.state.pending_center_y.toFixed(1)}`
              : 'n/a'}
            {' / '}
            {visibleResult.state.pending_confirm_count}
          </p>
          <p className="truncate">
            center jump:{' '}
            {visibleResult.state.center_jump_distance !== null
              ? visibleResult.state.center_jump_distance.toFixed(1)
              : 'n/a'}
            {' / age: '}
            {visibleResult.state.last_good_center_age_ms !== null
              ? `${visibleResult.state.last_good_center_age_ms.toFixed(0)}ms`
              : 'n/a'}
          </p>
          {visibleResult.state.center_accept_reason ? (
            <p className="truncate text-emerald-200">
              center accepted: {visibleResult.state.center_accept_reason}
            </p>
          ) : null}
          {visibleResult.state.center_rejected_reason ? (
            <p className="truncate text-amber-200">
              center rejected: {visibleResult.state.center_rejected_reason}
            </p>
          ) : null}
          <p className="truncate">
            smoothing: {visibleResult.state.smoothing_mode}
            {' / '}
            {visibleResult.state.smoothing_applied ? 'applied' : 'not applied'}
            {visibleResult.state.smoothing_distance !== null
              ? ` / ${visibleResult.state.smoothing_distance.toFixed(1)}`
              : ''}
          </p>
          {visibleResult.state.snap_reason ? (
            <p className="truncate text-cyan-200">
              center snap: {visibleResult.state.snap_reason}
            </p>
          ) : null}
          <p className="truncate">
            tracking: {visibleResult.state.tracking_mode}
            {' / reacquire: '}
            {visibleResult.state.reacquire_pending_count}
          </p>
          <p className="truncate">
            tracking center: {formatCoord(visibleResult.state.tracking_center_x)},
            {formatCoord(visibleResult.state.tracking_center_y)}
          </p>
          <p className="truncate">
            global check: {formatCoord(visibleResult.state.global_check_center_x)},
            {formatCoord(visibleResult.state.global_check_center_y)} / delta:{' '}
            {formatCoord(visibleResult.state.global_check_delta)} / confidence:{' '}
            {formatConfidence(visibleResult.state.global_check_confidence)}
          </p>
          <p
            className={cn(
              'truncate',
              visibleResult.state.tracking_suspect ? 'text-amber-200' : undefined,
            )}
          >
            tracking suspect: {visibleResult.state.tracking_suspect ? 'yes' : 'no'} / reset:{' '}
            {visibleResult.state.tracking_reset_reason || 'none'}
          </p>
          <p className="truncate">
            global checked: {formatUpdateTime(visibleResult.state.last_global_check_time)}
          </p>
          <p className="truncate">
            motion:{' '}
            {visibleResult.state.motion_diff !== null
              ? visibleResult.state.motion_diff.toFixed(2)
              : 'n/a'}
            {visibleResult.state.motion_unstable ? ' / unstable' : ' / stable'}
            {' / '}
            {visibleResult.state.motion_stable_count}
          </p>
          <p className="truncate">
            candidate distance:{' '}
            {visibleResult.state.candidate_distance_to_last_good !== null
              ? visibleResult.state.candidate_distance_to_last_good.toFixed(1)
              : 'n/a'}
          </p>
          <p className="truncate">
            match: {visibleResult.state.selected_match_source}
            {' / local: '}
            {formatConfidence(visibleResult.state.local_match_confidence)}
            {' / global: '}
            {formatConfidence(visibleResult.state.global_match_confidence)}
          </p>
          <p className="truncate">
            viewport confidence: {formatConfidence(visibleResult.state.viewport_detection_confidence)}
            {visibleResult.state.viewport_stale ? ' / stale' : ''}
          </p>
          <p className="truncate">
            viewport updated: {formatUpdateTime(visibleResult.state.last_viewport_update_time)}
          </p>
          {visibleResult.state.viewport_fallback_reason ? (
            <p className="truncate text-amber-200">
              viewport fallback: {visibleResult.state.viewport_fallback_reason}
            </p>
          ) : null}
          <p className="truncate">
            calibration path: {visibleResult.state.viewport_calibration_path || 'not loaded'}
          </p>
          <p className="truncate">
            calibration fallback: {visibleResult.state.viewport_fallback_used ? 'yes' : 'no'}
          </p>
          <p className="truncate">map area (overlay): {formatViewportRect(overlayViewport)}</p>
          <p className="truncate">map image: {formatImageRect(overlayViewport)}</p>
          <p className="truncate">
            nearest point: {visibleResult.state.nearest_loaded_point_name || 'none'} / image{' '}
            {formatCoord(visibleResult.state.nearest_loaded_point_image_x)},
            {formatCoord(visibleResult.state.nearest_loaded_point_image_y)}
          </p>
          <p className="truncate">
            nearest delta image:{' '}
            {formatCoord(visibleResult.state.nearest_loaded_point_delta_image_x)},
            {formatCoord(visibleResult.state.nearest_loaded_point_delta_image_y)} / screen{' '}
            {formatCoord(visibleResult.state.nearest_loaded_point_delta_screen_x)},
            {formatCoord(visibleResult.state.nearest_loaded_point_delta_screen_y)}
          </p>
          <p className="truncate">
            zoom: {formatScale(overlayViewport?.scale)} / map: {overlayViewport?.map_name ?? 'n/a'}
          </p>
          <p className="truncate">
            backend points: {samplePointsVisible ? 'shown' : 'hidden'} / backend rendered:{' '}
            {backendRenderedPoints.length}
          </p>
          <p className="truncate">
            mouse screen:{' '}
            {mouseCalibrationInfo
              ? `${mouseCalibrationInfo.screenX},${mouseCalibrationInfo.screenY}`
              : 'n/a'}
          </p>
          <p className="truncate">
            mouse area:{' '}
            {mouseCalibrationInfo
              ? `${mouseCalibrationInfo.areaX.toFixed(1)},${mouseCalibrationInfo.areaY.toFixed(1)}`
              : 'n/a'}
            {mouseCalibrationInfo?.insideArea ? ' / inside' : mouseCalibrationInfo ? ' / outside' : ''}
          </p>
          <p className="truncate">
            mouse image:{' '}
            {mouseCalibrationInfo
              ? `${mouseCalibrationInfo.imageX.toFixed(1)},${mouseCalibrationInfo.imageY.toFixed(1)}`
              : 'n/a'}
          </p>
          {copyMessage ? <p className="truncate text-cyan-200">{copyMessage}</p> : null}
          {visibleResult.state.viewport_calibration_error ? (
            <p className="truncate text-amber-200">
              viewport error: {visibleResult.state.viewport_calibration_error}
            </p>
          ) : null}
          {visibleResult.state.viewport_detection_error ? (
            <p className="truncate text-amber-200">
              viewport detect: {visibleResult.state.viewport_detection_error}
            </p>
          ) : null}
          {visibleResult.state.local_points_error ? (
            <p className="truncate text-amber-200">
              points error: {visibleResult.state.local_points_error}
            </p>
          ) : null}
          <p className="truncate">
            detection: {visibleResult.state.detection_source} /{' '}
            {formatConfidence(visibleResult.state.detection_confidence)}
          </p>
          <p className="truncate">
            detect time: {formatMs(visibleResult.state.detection_duration_ms)} / interval:{' '}
            {visibleResult.state.detection_interval_ms}ms
          </p>
          <p className="truncate">
            detected: {formatUpdateTime(visibleResult.state.last_detection_time)}
          </p>
          <p className="truncate">
            last ok: {formatUpdateTime(visibleResult.state.last_successful_detection_time)}
          </p>
          {visibleResult.state.detection_error ? (
            <p className="truncate text-amber-200">detect error: {visibleResult.state.detection_error}</p>
          ) : null}
          {error ? <p className="truncate text-rose-200">{error}</p> : null}
        </div>
      </div>

      {calibrationPanelVisible ? (
        <CalibrationAdjustmentPanel
          panelRef={calibrationPanelRef}
          viewport={calibrationViewport}
          calibrationJson={calibrationJson}
          mouseInfo={mouseCalibrationInfo}
          lastMapHoverCoordinate={lastMapHoverCoordinate}
          labels={labels}
          localPointDrafts={localPointDrafts}
          localPointsVisible={localPointsVisible}
          localPointLabelId={localPointLabelId}
          selectedDraftPoint={selectedDraftPoint}
          placementMode={placementMode}
          continuousPlacement={continuousPlacement}
          mapPointerInside={mapPointerInside}
          landmarkCenter={landmarkCenterCopy.value}
          landmarkCenterDisabledReason={landmarkCenterCopy.disabledReason}
          copyMessage={copyMessage}
          onCopyCalibration={() => void handleCopyCalibrationJson()}
          onCopyLandmarkCenter={() => void handleCopyLandmarkCenter()}
          onCopyMouse={() => void handleCopyMouseCoordinates()}
          onCopyLocalPoints={() => void handleCopyLocalPointsJson()}
          onAddLocalPoint={handleAddLocalPoint}
          onTogglePlacementMode={handleTogglePlacementMode}
          onContinuousPlacementChange={setContinuousPlacement}
          onUpdateLocalPoint={handleUpdateLocalPoint}
          onDeleteLocalPoint={handleDeleteLocalPoint}
          onDeleteSelectedDraftPoint={handleDeleteSelectedDraftPoint}
          onClearLocalPoints={handleClearLocalPoints}
          onToggleLocalPoints={() => setLocalPointsVisible((value) => !value)}
          onLocalPointLabelChange={setLocalPointLabelId}
          onChange={handleCalibrationFieldChange}
          onReset={() => setCalibrationDraft(null)}
          onClose={() => setCalibrationPanelVisible(false)}
        />
      ) : null}

      {calibrationVisible ? <CalibrationOverlay /> : null}
      {viewportDebugVisible ? (
        <ViewportCalibrationOverlay
          viewport={overlayViewport}
          mousePosition={mousePosition}
          mouseInfo={mouseCalibrationInfo}
        />
      ) : null}

      {placementMode ? (
        <PlacementModeOverlay
          viewport={overlayViewport}
          coordinate={mapPointerInside ? lastMapHoverCoordinate : null}
          continuous={continuousPlacement}
        />
      ) : null}

      {hoverPoint && hoverPosition ? (
        <div
          className="pointer-events-none absolute z-30 max-w-[220px] rounded-md border border-white/12 bg-slate-950/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur"
          style={hoverPosition}
        >
          <p className="truncate font-medium">{hoverPoint.point.name}</p>
          <p className="mt-0.5 truncate text-white/50">{hoverPoint.point.label_id}</p>
        </div>
      ) : null}

      {detailPoint && detailPosition ? (
        <div
          ref={popupRef}
          className="absolute z-40 w-[280px] rounded-lg border border-white/14 bg-slate-950/82 p-3 text-white shadow-xl backdrop-blur-md"
          style={detailPosition}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{detailPoint.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/50">
                {detailPoint.label_id} / {detailPoint.provider}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => {
                setSelectedPoint(null)
                setSelectedDetail(null)
                markerHoverRef.current = false
                updatePointerMode()
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
          <p className="mt-2 max-h-20 overflow-y-auto text-xs leading-5 text-white/68">
            {typeof detailPoint.detail?.description === 'string'
              ? detailPoint.detail.description
              : 'No description'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/46">
            <span>image x: {formatCoord(detailPoint.image_x)}</span>
            <span>image y: {formatCoord(detailPoint.image_y)}</span>
            {hasScreenCoords(detailPoint) ? (
              <>
                <span>screen x: {formatCoord(detailPoint.screen_x)}</span>
                <span>screen y: {formatCoord(detailPoint.screen_y)}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function isInside(element: HTMLElement | null, x: number, y: number) {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

const calibrationFields: Array<{
  field: CalibrationField
  label: string
  step: number
}> = [
  { field: 'screen_left', label: 'area left', step: 1 },
  { field: 'screen_top', label: 'area top', step: 1 },
  { field: 'screen_width', label: 'area width', step: 1 },
  { field: 'screen_height', label: 'area height', step: 1 },
  { field: 'image_left', label: 'image left', step: 0.1 },
  { field: 'image_top', label: 'image top', step: 0.1 },
  { field: 'image_width', label: 'image width', step: 0.1 },
  { field: 'image_height', label: 'image height', step: 0.1 },
  { field: 'scale', label: 'zoom', step: 0.01 },
]

function CalibrationAdjustmentPanel({
  panelRef,
  viewport,
  calibrationJson,
  mouseInfo,
  lastMapHoverCoordinate,
  labels,
  localPointDrafts,
  localPointsVisible,
  localPointLabelId,
  selectedDraftPoint,
  placementMode,
  continuousPlacement,
  mapPointerInside,
  landmarkCenter,
  landmarkCenterDisabledReason,
  copyMessage,
  onCopyCalibration,
  onCopyLandmarkCenter,
  onCopyMouse,
  onCopyLocalPoints,
  onAddLocalPoint,
  onTogglePlacementMode,
  onContinuousPlacementChange,
  onUpdateLocalPoint,
  onDeleteLocalPoint,
  onDeleteSelectedDraftPoint,
  onClearLocalPoints,
  onToggleLocalPoints,
  onLocalPointLabelChange,
  onChange,
  onReset,
  onClose,
}: {
  panelRef: RefObject<HTMLDivElement | null>
  viewport: MapMaskViewport | null
  calibrationJson: CalibrationJson | null
  mouseInfo: MouseCalibrationInfo | null
  lastMapHoverCoordinate: LastMapHoverCoordinate | null
  labels: MapMaskLabel[]
  localPointDrafts: MapMaskPoint[]
  localPointsVisible: boolean
  localPointLabelId: string
  selectedDraftPoint: MapMaskPoint | null
  placementMode: boolean
  continuousPlacement: boolean
  mapPointerInside: boolean
  landmarkCenter: LandmarkCenterJson | null
  landmarkCenterDisabledReason: string
  copyMessage: string
  onCopyCalibration: () => void
  onCopyLandmarkCenter: () => void
  onCopyMouse: () => void
  onCopyLocalPoints: () => void
  onAddLocalPoint: () => void
  onTogglePlacementMode: () => void
  onContinuousPlacementChange: (value: boolean) => void
  onUpdateLocalPoint: (pointId: string, patch: Partial<MapMaskPoint>) => void
  onDeleteLocalPoint: (pointId: string) => void
  onDeleteSelectedDraftPoint: () => void
  onClearLocalPoints: () => void
  onToggleLocalPoints: () => void
  onLocalPointLabelChange: (labelId: string) => void
  onChange: (field: CalibrationField, value: string) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-4 z-30 max-h-[calc(100vh-32px)] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-white/14 bg-slate-950/78 p-3 text-white shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Viewport Calibration</p>
          <p className="truncate text-[11px] text-white/50">
            {calibrationJson ? `${calibrationJson.map_name} / ${calibrationJson.screen_width}x${calibrationJson.screen_height}` : 'viewport unavailable'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          title="Close"
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {calibrationFields.map(({ field, label, step }) => (
          <label key={field} className="min-w-0 text-[11px] text-white/56">
            <span className="mb-1 block truncate">{label}</span>
            <Input
              type="number"
              tone="default"
              step={step}
              disabled={!viewport}
              value={viewport ? String(viewport[field]) : ''}
              onChange={(event) => onChange(field, event.currentTarget.value)}
              className="h-7 rounded-md border-white/12 bg-white/7 px-2 text-xs text-white"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 space-y-1 rounded-md border border-white/10 bg-white/7 p-2 text-[11px] text-white/58">
        <p className="truncate">map area: {calibrationJson ? `${calibrationJson.map_area_width}x${calibrationJson.map_area_height} at ${calibrationJson.map_area_left},${calibrationJson.map_area_top}` : 'n/a'}</p>
        <p className="truncate">map image: {calibrationJson ? `${calibrationJson.map_image_width}x${calibrationJson.map_image_height} at ${calibrationJson.map_image_left},${calibrationJson.map_image_top}` : 'n/a'}</p>
        <p className="truncate">
          mouse screen: {mouseInfo ? `${mouseInfo.screenX},${mouseInfo.screenY}` : 'n/a'}
        </p>
        <p className="truncate">
          mouse area: {mouseInfo ? `${mouseInfo.areaX.toFixed(1)},${mouseInfo.areaY.toFixed(1)}` : 'n/a'}
        </p>
        <p className="truncate">
          mouse image: {mouseInfo ? `${mouseInfo.imageX.toFixed(1)},${mouseInfo.imageY.toFixed(1)}` : 'n/a'}
        </p>
        {copyMessage ? <p className="truncate text-cyan-200">{copyMessage}</p> : null}
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/7 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[11px]">
            <p className="truncate font-medium text-white/78">Landmark Center</p>
            <p className={cn('truncate', landmarkCenter ? 'text-emerald-200/75' : 'text-amber-200/75')}>
              {landmarkCenter
                ? `accepted ${landmarkCenter.accepted_center_x.toFixed(1)},${landmarkCenter.accepted_center_y.toFixed(1)} / nearest ${landmarkCenter.nearest_loaded_point.name} ${landmarkCenter.expected_png_x.toFixed(1)},${landmarkCenter.expected_png_y.toFixed(1)} / confidence ${landmarkCenter.confidence.toFixed(2)}`
                : landmarkCenterDisabledReason}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
            onClick={onCopyLandmarkCenter}
            disabled={!landmarkCenter}
            title={landmarkCenterDisabledReason || 'Copy accepted viewport center as a landmark JSON fragment'}
          >
            <Copy className="size-3" />
            Copy Landmark Center
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-white/7 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white/78">Local Points</p>
            <p className="truncate text-[11px] text-white/48">
              {localPointDrafts.length} draft points / {localPointsVisible ? 'shown' : 'hidden'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-md text-white/62 hover:bg-white/10 hover:text-white"
              onClick={onToggleLocalPoints}
              title="Show or hide draft local points"
            >
              {localPointsVisible ? <Eye className="size-3 text-emerald-200" /> : <EyeOff className="size-3" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                'rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white',
                placementMode && 'border-amber-200/35 bg-amber-300/14 text-amber-100',
              )}
              onClick={onTogglePlacementMode}
              disabled={!viewport}
              title={placementMode ? 'Cancel point placement' : 'Add Point'}
            >
              <Plus className="size-3" />
              {placementMode ? 'Placing' : 'Add Point'}
            </Button>
          </div>
        </div>

        <div className="mt-2 space-y-1 rounded-md border border-white/10 bg-slate-950/28 p-2 text-[11px] text-white/52">
          <p className={cn('truncate', placementMode ? 'text-amber-100' : 'text-white/52')}>
            placement: {placementMode ? (mapPointerInside ? '点击地图添加点位，Esc 取消' : '请把鼠标移到地图区域') : 'off'}
          </p>
          <label className="flex items-center gap-2 text-[11px] text-white/58">
            <Checkbox
              checked={continuousPlacement}
              onCheckedChange={(checked) => onContinuousPlacementChange(Boolean(checked))}
              className="size-3 border-white/35 bg-white/8"
            />
            <span className="truncate">continuous placement</span>
          </label>
          <p className="truncate">
            last map screen:{' '}
            {lastMapHoverCoordinate
              ? `${lastMapHoverCoordinate.screen_x},${lastMapHoverCoordinate.screen_y}`
              : '请先把鼠标移到地图区域'}
          </p>
          <p className="truncate">
            last map area:{' '}
            {lastMapHoverCoordinate
              ? `${lastMapHoverCoordinate.area_x.toFixed(1)},${lastMapHoverCoordinate.area_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            last map image:{' '}
            {lastMapHoverCoordinate
              ? `${lastMapHoverCoordinate.image_x.toFixed(1)},${lastMapHoverCoordinate.image_y.toFixed(1)}`
              : 'n/a'}
          </p>
          <p className="truncate">
            viewport timestamp: {lastMapHoverCoordinate?.viewport_timestamp ?? 'n/a'}
          </p>
          <p className="truncate">
            selected draft: {selectedDraftPoint?.name ?? 'none'}
          </p>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={localPointLabelId}
            onChange={(event) => onLocalPointLabelChange(event.currentTarget.value)}
            className="h-7 min-w-0 rounded-md border border-white/12 bg-slate-950/70 px-2 text-xs text-white outline-none"
          >
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
            onClick={onCopyLocalPoints}
          >
            <Copy className="size-3" />
            Points
          </Button>
        </div>

        <p className="mt-2 truncate text-[11px] text-white/48">
          Add Here 将添加到最后悬停的地图位置
          {lastMapHoverCoordinate
            ? ` / image ${lastMapHoverCoordinate.image_x.toFixed(1)},${lastMapHoverCoordinate.image_y.toFixed(1)}`
            : ' / 请先把鼠标移到地图区域'}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
            onClick={onAddLocalPoint}
            disabled={!lastMapHoverCoordinate || !viewport}
            title="将添加到最后悬停的地图位置"
          >
            <Plus className="size-3" />
            Add Here
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
            onClick={onDeleteSelectedDraftPoint}
            disabled={!selectedDraftPoint}
          >
            <Trash2 className="size-3" />
            Selected
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
            onClick={onClearLocalPoints}
            disabled={localPointDrafts.length === 0}
          >
            Clear
          </Button>
        </div>

        <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
          {localPointDrafts.length === 0 ? (
            <p className="rounded-md border border-dashed border-white/12 px-2 py-2 text-[11px] text-white/42">
              Move over the map and add the current image coordinate.
            </p>
          ) : (
            localPointDrafts.map((point) => (
              <div key={point.id} className="rounded-md border border-white/10 bg-slate-950/35 p-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    value={point.name}
                    onChange={(event) => onUpdateLocalPoint(point.id, { name: event.currentTarget.value })}
                    className="h-7 rounded-md border-white/12 bg-white/7 px-2 text-xs text-white"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="rounded-md text-white/62 hover:bg-white/10 hover:text-white"
                    onClick={() => onDeleteLocalPoint(point.id)}
                    title="Delete local point"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <select
                  value={point.label_id}
                  onChange={(event) => {
                    const labelId = event.currentTarget.value
                    const label = labels.find((item) => item.id === labelId)
                    onUpdateLocalPoint(point.id, {
                      label_id: labelId,
                      icon: label?.icon || `${labelId}.svg`,
                    })
                  }}
                  className="mt-2 h-7 w-full rounded-md border border-white/12 bg-slate-950/70 px-2 text-xs text-white outline-none"
                >
                  {labels.map((label) => (
                    <option key={label.id} value={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 truncate text-[11px] text-white/42">
                  image {point.image_x.toFixed(1)},{point.image_y.toFixed(1)} / {point.map_name}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
          onClick={onCopyMouse}
          disabled={!lastMapHoverCoordinate && !mouseInfo}
        >
          <Copy className="size-3" />
          Mouse
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
          onClick={onCopyCalibration}
          disabled={!calibrationJson}
        >
          <Copy className="size-3" />
          JSON
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
          onClick={onCopyLocalPoints}
        >
          <Copy className="size-3" />
          Points
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="rounded-md border border-white/10 bg-white/7 text-white/75 hover:bg-white/12 hover:text-white"
          onClick={onReset}
          disabled={!viewport}
        >
          Reset
        </Button>
      </div>
    </div>
  )
}

function CalibrationOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-0 border-2 border-lime-300/85" />
      <div className="absolute left-1/2 top-0 h-full w-px bg-lime-300/70" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-lime-300/70" />
      <div className="absolute left-0 top-0 size-10 border-l-4 border-t-4 border-lime-300" />
      <div className="absolute right-0 top-0 size-10 border-r-4 border-t-4 border-lime-300" />
      <div className="absolute bottom-0 left-0 size-10 border-b-4 border-l-4 border-lime-300" />
      <div className="absolute bottom-0 right-0 size-10 border-b-4 border-r-4 border-lime-300" />
      <div className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lime-300 bg-slate-950/35" />
    </div>
  )
}

function PlacementModeOverlay({
  viewport,
  coordinate,
  continuous,
}: {
  viewport: MapMaskViewport | null
  coordinate: LastMapHoverCoordinate | null
  continuous: boolean
}) {
  const message = coordinate
    ? `点击地图添加点位，Esc 取消${continuous ? '，连续添加开启' : ''}`
    : '请把鼠标移到地图区域'
  const labelLeft = viewport
    ? clamp(viewport.screen_left + viewport.screen_width / 2 - 150, 12, window.innerWidth - 312)
    : 12
  const labelTop = viewport ? clamp(viewport.screen_top + 16, 12, window.innerHeight - 60) : 12

  return (
    <div className="pointer-events-none absolute inset-0 z-[18] text-amber-50">
      <div
        className="absolute rounded-md border border-amber-200/35 bg-slate-950/76 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
        style={{ left: labelLeft, top: labelTop }}
      >
        <p className="font-medium">{message}</p>
        {coordinate ? (
          <p className="mt-0.5 text-[11px] text-amber-100/72">
            image {coordinate.image_x.toFixed(1)},{coordinate.image_y.toFixed(1)} / A or Enter 添加
          </p>
        ) : null}
      </div>
      {coordinate ? (
        <div
          className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-100 bg-amber-300/28 shadow-[0_0_18px_rgba(251,191,36,0.75)]"
          style={{ left: coordinate.screen_x, top: coordinate.screen_y }}
        >
          <div className="absolute left-1/2 top-[-10px] h-10 w-px -translate-x-1/2 bg-amber-100/75" />
          <div className="absolute left-[-10px] top-1/2 h-px w-10 -translate-y-1/2 bg-amber-100/75" />
        </div>
      ) : null}
    </div>
  )
}

function ViewportCalibrationOverlay({
  viewport,
  mousePosition,
  mouseInfo,
}: {
  viewport: MapMaskViewport | null
  mousePosition: { x: number; y: number } | null
  mouseInfo: MouseCalibrationInfo | null
}) {
  if (!viewport) {
    return (
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md border border-cyan-300/35 bg-slate-950/65 px-2 py-1 text-[11px] text-cyan-100">
        viewport unavailable
      </div>
    )
  }

  const style = {
    left: viewport.screen_left,
    top: viewport.screen_top,
    width: viewport.screen_width,
    height: viewport.screen_height,
  }
  const labelLeft = clamp(viewport.screen_left + 8, 8, window.innerWidth - 240)
  const labelTop = clamp(viewport.screen_top + 8, 8, window.innerHeight - 80)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-cyan-100">
      <div className="absolute border-2 border-cyan-300/85" style={style}>
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(103,232,249,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(103,232,249,0.35) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-cyan-300/80" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-cyan-300/80" />
        <div className="absolute left-0 top-0 size-8 border-l-4 border-t-4 border-cyan-200" />
        <div className="absolute right-0 top-0 size-8 border-r-4 border-t-4 border-cyan-200" />
        <div className="absolute bottom-0 left-0 size-8 border-b-4 border-l-4 border-cyan-200" />
        <div className="absolute bottom-0 right-0 size-8 border-b-4 border-r-4 border-cyan-200" />
      </div>
      <div
        className="absolute rounded-md border border-cyan-300/35 bg-slate-950/70 px-2 py-1 text-[11px] shadow"
        style={{ left: labelLeft, top: labelTop }}
      >
        <p>
          area {viewport.screen_width}x{viewport.screen_height} at {viewport.screen_left},
          {viewport.screen_top}
        </p>
        <p>
          image {viewport.image_left.toFixed(1)},{viewport.image_top.toFixed(1)} / zoom{' '}
          {viewport.scale.toFixed(2)}
        </p>
        <p>
          mouse {mousePosition ? `${mousePosition.x},${mousePosition.y}` : 'n/a'}
        </p>
        <p>
          area {mouseInfo ? `${mouseInfo.areaX.toFixed(1)},${mouseInfo.areaY.toFixed(1)}` : 'n/a'}
          {mouseInfo?.insideArea ? ' in' : mouseInfo ? ' out' : ''}
        </p>
        <p>
          image {mouseInfo ? `${mouseInfo.imageX.toFixed(1)},${mouseInfo.imageY.toFixed(1)}` : 'n/a'}
        </p>
      </div>
    </div>
  )
}
