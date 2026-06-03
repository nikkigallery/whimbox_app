import { join } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

import { app } from 'electron'

/**
 * macOS Python environment service.
 * Uses the `python-embedded` directory extracted to userData.
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const pythonDir = join(app.getPath('userData'), 'python-embedded')
    const scriptsDir = join(pythonDir, 'bin')
    const pythonPath = join(scriptsDir, 'python3')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  getInitialBackendStatus(): BackendStatus | null {
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    return null
  }

  shouldSkipLaunchInDev(): boolean {
    return true
  }
}
