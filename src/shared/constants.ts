export const ENVIRONMENT = {
  IS_DEV: process.env.NODE_ENV === 'development',
}

export const PLATFORM = {
  IS_MAC: process.platform === 'darwin',
  IS_WINDOWS: process.platform === 'win32',
  IS_LINUX: process.platform === 'linux',
}

export const RPC_SERVER = {
  host: '127.0.0.1',
  port: 8350,
}

export const RPC_URL = `ws://${RPC_SERVER.host}:${RPC_SERVER.port}`
