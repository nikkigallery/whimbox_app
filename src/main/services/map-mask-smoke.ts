import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app, type BrowserWindow } from 'electron'
import log from 'electron-log/main.js'

import {
  MapMaskOverlayWindow,
  getMapMaskOverlayDebugState,
  setMapMaskOverlayIgnoreMouseEvents,
} from '../windows/map-mask-overlay'

type SmokeOptions = {
  waitForRpcConnected: (timeoutMs: number) => Promise<boolean>
}

type RendererDebugState = {
  enabled: boolean
  visibleCount: number
  selectedLabelIds: string[]
  labels: string[]
  hoverPointId: string | null
  selectedPointId: string | null
  detailPointId: string | null
  hasValidViewport: boolean
  isBigMapOpen: boolean
  viewportSource: string
  detectionSource: string
}

type CanvasPixel = {
  x: number
  y: number
  rgba: number[]
}

const SMOKE_DIR = join(process.cwd(), 'map-mask-smoke-artifacts')

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function smokeLog(message: string) {
  log.info(`[map-mask-smoke] ${message}`)
}

async function waitForRendererState(
  win: BrowserWindow,
  predicate: (state: RendererDebugState | null) => boolean,
  timeoutMs = 10_000,
) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const state = await readRendererState(win)
    if (predicate(state)) return state
    await wait(200)
  }
  return null
}

async function readRendererState(win: BrowserWindow): Promise<RendererDebugState | null> {
  return await win.webContents.executeJavaScript(
    `(() => {
      const root = document.querySelector('[data-testid="map-mask-overlay"]');
      if (!root) return null;
      const split = (value) => value ? value.split(',').filter(Boolean) : [];
      return {
        enabled: root.dataset.enabled === 'true',
        visibleCount: Number(root.dataset.visibleCount || 0),
        selectedLabelIds: split(root.dataset.selectedLabelIds || ''),
        labels: split(root.dataset.labelIds || ''),
        hoverPointId: root.dataset.hoverPointId || null,
        selectedPointId: root.dataset.selectedPointId || null,
        detailPointId: root.dataset.detailPointId || null,
        hasValidViewport: root.dataset.hasValidViewport === 'true',
        isBigMapOpen: root.dataset.isBigmapOpen === 'true',
        viewportSource: root.dataset.viewportSource || '',
        detectionSource: root.dataset.detectionSource || '',
      };
    })()`,
    true,
  ) as RendererDebugState | null
}

async function capture(win: BrowserWindow, name: string) {
  mkdirSync(SMOKE_DIR, { recursive: true })
  const image = await win.capturePage()
  const file = join(SMOKE_DIR, name)
  writeFileSync(file, image.toPNG())
  return file
}

async function readCanvasPixels(win: BrowserWindow): Promise<CanvasPixel[]> {
  return await win.webContents.executeJavaScript(
    `(() => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return [];
      return [
        { x: 235, y: 289, rgba: Array.from(ctx.getImageData(235, 289, 1, 1).data) },
        { x: 500, y: 500, rgba: Array.from(ctx.getImageData(500, 500, 1, 1).data) },
      ];
    })()`,
    true,
  ) as CanvasPixel[]
}

async function clickLabel(win: BrowserWindow, labelId: string) {
  await win.webContents.executeJavaScript(
    `(() => {
      const label = document.querySelector('[data-map-mask-label-id="${labelId}"]');
      if (!label) return false;
      label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`,
    true,
  )
}

async function clickBigMapMode(win: BrowserWindow, mode: 'auto' | 'force-open' | 'force-closed') {
  await win.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('[data-map-mask-bigmap-mode="${mode}"]');
      if (!button) return false;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`,
    true,
  )
}

async function clickCanvasPoint(win: BrowserWindow, x: number, y: number) {
  await win.webContents.executeJavaScript(
    `(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const options = { bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y} };
      canvas.dispatchEvent(new PointerEvent('pointermove', options));
      canvas.dispatchEvent(new MouseEvent('click', options));
      return true;
    })()`,
    true,
  )
}

export async function runMapMaskSmoke(options: SmokeOptions) {
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    screenshots: [],
  }

  try {
    mkdirSync(SMOKE_DIR, { recursive: true })
    smokeLog('waiting for RPC')
    report.rpcConnected = await options.waitForRpcConnected(10_000)
    smokeLog(`RPC connected=${String(report.rpcConnected)}`)

    const win = await MapMaskOverlayWindow()
    setMapMaskOverlayIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(true, 'normal')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    win.showInactive()
    report.initialOverlayWindow = getMapMaskOverlayDebugState()
    smokeLog('overlay shown')

    const initial = await waitForRendererState(
      win,
      (state) => Boolean(state?.hasValidViewport && state.visibleCount >= 2),
    )
    report.initialRendererState = initial
    smokeLog(`initial state=${JSON.stringify(initial)}`)
    await wait(500)
    report.initialCanvasPixels = await readCanvasPixels(win)
    ;(report.screenshots as string[]).push(await capture(win, '01-initial-overlay.png'))
    smokeLog('initial capture saved')

    await clickBigMapMode(win, 'force-closed')
    smokeLog('bigmap force-closed clicked')
    const afterBigMapClosed = await waitForRendererState(
      win,
      (state) => Boolean(state && !state.isBigMapOpen && state.visibleCount === 0),
    )
    report.afterBigMapClosedRendererState = afterBigMapClosed
    smokeLog(`after bigmap closed state=${JSON.stringify(afterBigMapClosed)}`)
    ;(report.screenshots as string[]).push(await capture(win, '02-bigmap-force-closed.png'))

    await clickBigMapMode(win, 'force-open')
    smokeLog('bigmap force-open clicked')
    const afterBigMapOpen = await waitForRendererState(
      win,
      (state) => Boolean(state?.isBigMapOpen && state.visibleCount >= 2),
    )
    report.afterBigMapOpenRendererState = afterBigMapOpen
    smokeLog(`after bigmap open state=${JSON.stringify(afterBigMapOpen)}`)
    ;(report.screenshots as string[]).push(await capture(win, '03-bigmap-force-open.png'))

    await clickLabel(win, 'material')
    smokeLog('material label clicked')
    const afterToggle = await waitForRendererState(
      win,
      (state) =>
        Boolean(
          state &&
            afterBigMapOpen &&
            state.visibleCount < afterBigMapOpen.visibleCount &&
            !state.selectedLabelIds.includes('material'),
        ),
    )
    report.afterToggleRendererState = afterToggle
    smokeLog(`after toggle state=${JSON.stringify(afterToggle)}`)
    report.afterToggleCanvasPixels = await readCanvasPixels(win)
    ;(report.screenshots as string[]).push(await capture(win, '04-after-category-toggle.png'))
    smokeLog('toggle capture saved')

    await clickCanvasPoint(win, 500, 500)
    smokeLog('canvas point clicked')
    const afterPopup = await waitForRendererState(
      win,
      (state) => Boolean(state?.detailPointId),
    )
    report.afterPopupRendererState = afterPopup
    smokeLog(`after popup state=${JSON.stringify(afterPopup)}`)
    ;(report.screenshots as string[]).push(await capture(win, '05-point-detail-popup.png'))
    smokeLog('popup capture saved')

    await clickLabel(win, 'material')
    await waitForRendererState(
      win,
      (state) => Boolean(state?.selectedLabelIds.includes('material')),
      5_000,
    )

    report.overlayWindow = getMapMaskOverlayDebugState()
    report.passed = Boolean(
      report.rpcConnected &&
      initial &&
      initial.visibleCount >= 2 &&
      afterBigMapClosed?.visibleCount === 0 &&
      afterBigMapOpen &&
      afterBigMapOpen.visibleCount >= 2 &&
      afterToggle &&
      !afterToggle.selectedLabelIds.includes('material') &&
      afterPopup?.detailPointId,
    )
  } catch (error) {
    report.passed = false
    report.error = error instanceof Error ? error.stack ?? error.message : String(error)
  }

  const reportPath = join(SMOKE_DIR, 'report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  log.info(`[map-mask-smoke] report written to ${reportPath}`)
  if (process.env.WHIMBOX_MAP_MASK_SMOKE_EXIT === '1') {
    setTimeout(() => app.quit(), 500)
  }
  return report
}
