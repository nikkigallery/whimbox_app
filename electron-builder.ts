/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: <> */
import type { Configuration } from 'electron-builder'

import {
  main,
  version,
  resources,
  displayName,
} from './package.json'

import { getDevFolder } from './src/lib/electron-app/release/utils/path'

const currentYear = new Date().getFullYear()

// 与 whimbox_launcher 风格一致：appId / 产物名 / 中文快捷方式等
const appId = 'com.nikkigallery.whimbox_app'
const artifactName = `${displayName}-setup-${version}.${'${ext}'}`

export default {
  appId,
  productName: displayName,
  copyright: `Copyright © ${currentYear} nikkigallery`,

  directories: {
    app: getDevFolder(main),
    output: `dist/v${version}`,
  },

  // 将 assets 目录打包到安装包的「资源」目录，运行时通过 process.resourcesPath 访问
  extraResources: [
    {
      from: 'assets',
      to: 'assets',
      filter: ['**/*'],
    },
  ],

  // // 控制 asar 解包，避免整颗 node_modules 进 unpacked 导致包体过大
  // asar: {
  //   smartUnpack: false,
  // },
  // asarUnpack: ['**/*.node'],
  // // 仅解压 .node 原生模块；若依赖里没有 .node，可改为 [] 进一步减小体积

  win: {
    artifactName,
    icon: `${resources}/build/icons/icon.ico`,
    target: [{ target: 'nsis', arch: ['x64'] }],
    requestedExecutionLevel: 'requireAdministrator', // 始终以管理员身份运行
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    installerIcon: `${resources}/build/icons/icon.ico`,
    uninstallerIcon: `${resources}/build/icons/icon.ico`,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: '奇想盒',
    language: '2052',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    displayLanguageSelector: false,
    uninstallDisplayName: '奇想盒',
    include: 'installer.nsh', // 自定义安装脚本，用于保护用户数据文件夹
  },
  publish: {
    provider: 'generic',
    url: 'https://nikkigallery.vip/static/whimbox/electron/',
  },
} satisfies Configuration
