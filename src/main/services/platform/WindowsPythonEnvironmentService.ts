import { join } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

/**
 * Windows Python environment service.
 * Uses the bundled `python-embedded` directory extracted from a .zip asset.
 */
export class WindowsPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const pythonDir = join(appDir, 'python-embedded')
    const scriptsDir = join(pythonDir, 'Scripts')
    const pythonPath = join(pythonDir, 'python.exe')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ';' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONHOME: paths.pythonDir,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  getInitialBackendStatus(): null {
    // Windows reads status from persisted store; no override needed.
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<null> {
    // Windows always goes through the full setup flow.
    return null
  }
}
