import type { IPythonEnvironmentService } from '../../interfaces/IPythonEnvironmentService'
import { MacOSPythonEnvironmentService } from './MacOSPythonEnvironmentService'
import { WindowsPythonEnvironmentService } from './WindowsPythonEnvironmentService'

let _instance: IPythonEnvironmentService | null = null

/**
 * Return the singleton IPythonEnvironmentService for the running platform.
 * All process.platform checks for Python path resolution are centralised here.
 */

export function getPythonEnvironmentService(): IPythonEnvironmentService {
  if (_instance) return _instance

  if (process.platform === 'darwin') {
    _instance = new MacOSPythonEnvironmentService()
  } else {
    _instance = new WindowsPythonEnvironmentService()
  }

  return _instance
}
