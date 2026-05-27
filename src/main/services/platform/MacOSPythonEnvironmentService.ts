import { join } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

/**
 * macOS Python environment service.
 * Uses a local virtualenv (`Whimbox/.venv`) for development and packages the
 * backend as a pre-installed venv in production.
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    // In production the venv sits alongside the app bundle.
    // In development it lives in the sibling Whimbox project directory.
    const pythonDir = join(appDir, '.venv')
    const scriptsDir = join(pythonDir, 'bin')
    const pythonPath = join(scriptsDir, 'python')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    const env = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
    delete env.PYTHONHOME
    return env
  }

  getInitialBackendStatus(): BackendStatus | null {
    // TODO: implement macOS-specific backend status detection when macOS support lands
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    // TODO: implement macOS-specific fast setup when macOS support lands
    return null
  }
}
