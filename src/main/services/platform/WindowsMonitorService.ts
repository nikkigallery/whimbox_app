import { screen } from 'electron'
import type { IMonitorService, WorkArea } from '../../interfaces/IMonitorService'

/**
 * Windows monitor service.
 * Uses the primary display, matching the original pre-refactor behaviour.
 */
export class WindowsMonitorService implements IMonitorService {
  getActiveDisplayWorkArea(): WorkArea {
    return screen.getPrimaryDisplay().workArea
  }
}
