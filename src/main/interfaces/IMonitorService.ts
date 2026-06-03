/**
 * Abstraction for platform-specific monitor/display detection.
 * Consumers call getMonitorService() and use this interface; they never
 * inspect process.platform directly.
 */
export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface IMonitorService {
  /**
   * Return the work area of the display closest to the current cursor.
   * Falls back to the primary display if the cursor cannot be determined.
   */
  getActiveDisplayWorkArea(): WorkArea
}
