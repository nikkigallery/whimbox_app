import { screen } from 'electron'
import type { IMonitorService, WorkArea } from '../../interfaces/IMonitorService'

/**
 * macOS monitor service.
 * Resolves the display nearest to the cursor so that overlays spawn on the
 * correct screen in multi-monitor setups.
 */
export class MacOSMonitorService implements IMonitorService {
  getActiveDisplayWorkArea(): WorkArea {
    const cursorPoint = screen.getCursorScreenPoint()
    return screen.getDisplayNearestPoint(cursorPoint).workArea
  }
}
