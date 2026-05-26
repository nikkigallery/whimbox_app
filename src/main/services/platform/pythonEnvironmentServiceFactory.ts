import type { IPythonEnvironmentService } from '../../interfaces/IPythonEnvironmentService'

let _instance: IPythonEnvironmentService | null = null

/**
 * Return the singleton IPythonEnvironmentService for the running platform.
 * All process.platform checks for Python path resolution are centralised here.
 */
export function getPythonEnvironmentService(): IPythonEnvironmentService {
  if (_instance) return _instance

  if (process.platform === 'darwin') {
    const { MacOSPythonEnvironmentService } = require('./MacOSPythonEnvironmentService')
    _instance = new MacOSPythonEnvironmentService()
  } else {
    const { WindowsPythonEnvironmentService } = require('./WindowsPythonEnvironmentService')
    _instance = new WindowsPythonEnvironmentService()
  }

  return _instance!
}
