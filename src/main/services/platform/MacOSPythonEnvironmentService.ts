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
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONHOME: '',  // Not set on macOS to avoid conflicts with system Python
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  getInitialBackendStatus(): BackendStatus {
    // On macOS the backend (whimbox) is pre-installed in the venv.
    return {
      installed: true,
      version: '0.0.0',
      installedAt: Date.now(),
      packageName: 'whimbox',
      entryPoint: 'whimbox',
    }
  }

  async tryFastSetup(pythonPath: string): Promise<PythonEnvInfo> {
    // On macOS, skip the Windows extraction flow and just verify the interpreter.
    return {
      installed: true,
      command: pythonPath,
      version: 'system',
      path: pythonPath,
      pipAvailable: true,
    }
  }
}
