import type { IMonitorService } from '../../interfaces/IMonitorService'
import { MacOSMonitorService } from './MacOSMonitorService'
import { WindowsMonitorService } from './WindowsMonitorService'

let _instance: IMonitorService | null = null

/**
 * Return the singleton IMonitorService for the running platform.
 * All process.platform checks for monitor resolution are centralised here.
 */
export function getMonitorService(): IMonitorService {
  if (_instance) return _instance

  if (process.platform === 'darwin') {
    _instance = new MacOSMonitorService()
  } else {
    // Windows (and any other future platform) defaults to primary display
    _instance = new WindowsMonitorService()
  }

  return _instance
}
