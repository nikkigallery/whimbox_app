import { join, dirname } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

import { app } from 'electron'

/**
 * macOS Python environment service.
 * Uses the `python-embedded` directory extracted to userData.
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const pythonDir = join(appDir, 'python')
    const pythonPath = join(pythonDir, 'bin', 'python3')
    const scriptsDir = join(pythonDir, 'bin')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    const userSitePackages = join(app.getPath('userData'), 'site-packages')
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: userSitePackages,
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  getInitialBackendStatus(): BackendStatus | null {
    // macOS reads status from persisted store; no override needed.
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    // macOS always goes through the full setup flow for the standalone python.
    return null
  }

  shouldSkipLaunchInDev(): boolean {
    return true
  }
}
