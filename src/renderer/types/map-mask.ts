export type MapMaskLabel = {
  id: string
  name: string
  parent_id: string | null
  icon: string | null
  provider: string
  default_enabled: boolean
}

export type MapMaskPointDetail = {
  description?: string
  images?: string[]
  [key: string]: unknown
}

export type MapMaskPoint = {
  id: string
  label_id: string
  name: string
  map_name: string
  image_x: number
  image_y: number
  game_x: number | null
  game_y: number | null
  icon: string | null
  provider: string
  detail: MapMaskPointDetail
}

export type MapMaskViewport = {
  map_name: string
  image_left: number
  image_top: number
  image_width: number
  image_height: number
  screen_left: number
  screen_top: number
  screen_width: number
  screen_height: number
  scale: number
  rotation: number
}

export type MapMaskState = {
  enabled: boolean
  is_map_open?: boolean
  is_bigmap_open: boolean
  provider: string
  fallback_provider: string
  data_source: 'sample' | 'local' | 'fallback' | string
  labels_source: 'sample' | 'local' | 'fallback' | string
  points_source: 'sample' | 'local' | 'fallback' | string
  local_labels_path: string
  local_points_path: string
  local_labels_error: string
  local_points_error: string
  selected_label_ids: string[]
  has_valid_viewport: boolean
  viewport: MapMaskViewport | null
  viewport_mode: MapMaskViewportMode
  viewport_source: string
  viewport_fallback_used: boolean
  viewport_fallback_reason: string
  viewport_detection_confidence: number
  viewport_detection_error: string
  viewport_center_x: number | null
  viewport_center_y: number | null
  raw_center_x: number | null
  raw_center_y: number | null
  accepted_center_x: number | null
  accepted_center_y: number | null
  corrected_center_x: number | null
  corrected_center_y: number | null
  center_correction_enabled: boolean
  center_correction_scale_x: number
  center_correction_scale_y: number
  center_correction_offset_x: number
  center_correction_offset_y: number
  center_correction_source: string
  pending_center_x: number | null
  pending_center_y: number | null
  center_jump_distance: number | null
  center_accept_reason: string
  center_rejected_reason: string
  pending_confirm_count: number
  last_good_center_age_ms: number | null
  smoothing_mode: 'off' | 'jitter-only' | 'all' | string
  smoothing_applied: boolean
  smoothing_distance: number | null
  snap_reason: string
  tracking_mode: 'idle' | 'tracking' | 'reacquire' | string
  motion_diff: number | null
  motion_unstable: boolean
  candidate_distance_to_last_good: number | null
  local_match_confidence: number | null
  global_match_confidence: number | null
  selected_match_source: string
  reacquire_pending_count: number
  tracking_center_x: number | null
  tracking_center_y: number | null
  global_check_center_x: number | null
  global_check_center_y: number | null
  global_check_delta: number | null
  global_check_confidence: number | null
  tracking_suspect: boolean
  tracking_reset_reason: string
  last_global_check_time: string
  last_viewport_update_time: string
  viewport_stale: boolean
  viewport_calibration_path: string
  viewport_calibration_error: string
  viewport_screen_width: number | null
  viewport_screen_height: number | null
  map_scale: number | null
  map_scale_source: string
  viewport_span_source: string
  assumes_max_bigmap_zoom: boolean
  zoom_status: 'unknown' | 'supported' | 'unsupported' | 'error' | string
  zoom_level: 'second' | 'third' | 'max' | string
  zoom_confidence: number
  overlay_hint: string
  detection_mode: MapMaskBigMapDetectionMode
  detection_source: string
  detection_confidence: number
  raw_is_bigmap_open: boolean
  detection_error: string
  last_detection_time: string
  last_successful_detection_time: string
  detection_duration_ms: number
  debug?: boolean
  message?: string
}

export type MapMaskBigMapDetectionMode = 'auto' | 'force-open' | 'force-closed'
export type MapMaskViewportMode = 'sample' | 'manual-calibration' | 'auto-placeholder' | 'hybrid-auto-center'

export type VisibleMapMaskPoint = MapMaskPoint & {
  screen_x: number
  screen_y: number
  is_visible: boolean
}

export type MapMaskLabelsResponse = {
  labels: MapMaskLabel[]
  selected_label_ids: string[]
}

export type MapMaskVisiblePointsResponse = {
  points: VisibleMapMaskPoint[]
  state: MapMaskState
}

export type MapMaskUserStatus = {
  auth_state: 'anonymous' | 'opening-login' | 'loading-user-state' | 'authenticated' | 'cancelled' | 'error' | string
  authenticated: boolean
  auth_error: string
  openid_masked: string
  hide_awarded: boolean
  refreshing: boolean
  refresh_error: string
  refresh_failure_count: number
  refresh_reason: string
  last_refresh_at: string
  last_refresh_reason: string
  next_refresh_in_seconds: number
  awarded_star_count: number
  awarded_dewdrop_count: number
  awarded_box_count: number
  awarded_read_count: number
  matched_awarded_star_count: number
  matched_awarded_dewdrop_count: number
  matched_awarded_box_count: number
  matched_awarded_read_count: number
}
