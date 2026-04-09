import { useEffect, useState } from 'react'
import { PlayCircle, Square, Tv } from 'lucide-react'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { KeybindInput } from 'renderer/components/settings-dialog/keybind-input'
import { Button } from 'renderer/components/ui/button'
import { Slider } from 'renderer/components/ui/slider'
import { cn } from 'renderer/lib/utils'
import { toast } from 'sonner'

type VideoOverlayState = {
  visible: boolean
  url: string
  opacity: number
  playPauseKey: string
  seekForwardKey: string
  seekBackwardKey: string
}

const defaultState: VideoOverlayState = {
  visible: false,
  url: '',
  opacity: 1,
  playPauseKey: 'f8',
  seekForwardKey: 'f9',
  seekBackwardKey: 'f7',
}

export function VideoOverlayPage() {
  const [state, setState] = useState<VideoOverlayState>(defaultState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const api = window.App.videoOverlay
    if (!api) return
    api.getState()
      .then((nextState) => {
        setState(nextState)
      })
      .finally(() => setLoading(false))
    const off = api.onState((nextState) => {
      setState(nextState)
    })
    return () => off()
  }, [])

  const handleSetState = async (patch: Record<string, unknown>) => {
    const api = window.App.videoOverlay
    if (!api) return
    setSaving(true)
    try {
      const nextState = await api.setState(patch)
      setState(nextState)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleOpen = async () => {
    const api = window.App.videoOverlay
    if (!api) return
    try {
      await api.show()
      await api.focusInput()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打开失败')
    }
  }

  const handleClose = async () => {
    const api = window.App.videoOverlay
    if (!api) return
    await api.hide()
  }

  return (
    <ScrollCenterLayout
      scrollOuter={false}
      innerClassName="flex flex-1 flex-col min-h-0 gap-4 px-10 py-8"
    >
      <SettingsPageLayout
        className="flex-1 min-h-0"
        title="视频小窗"
        description="悬浮显示网页视频攻略，不主动抢占游戏焦点，播放控制走全局快捷键。"
        actions={saving ? <span className="text-xs text-slate-400">保存中...</span> : null}
      >
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-pink-100 text-pink-500 dark:bg-pink-500/15 dark:text-pink-300">
                <Tv className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">窗口控制</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {state.visible ? '视频小窗当前已打开' : '视频小窗当前已关闭'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleOpen}
                disabled={loading || saving}
                className="rounded-xl bg-pink-400 text-white shadow-sm hover:bg-pink-500 dark:bg-pink-500 dark:hover:bg-pink-400"
              >
                <PlayCircle className="size-4" />
                打开小窗
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading || saving}
                className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Square className="size-4" />
                关闭小窗
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-100">
                  小窗透明度
                </label>
                <span className="text-xs text-slate-400">{Math.round(state.opacity * 100)}%</span>
              </div>
              <Slider
                min={20}
                max={100}
                step={1}
                value={[Math.round(state.opacity * 100)]}
                className={cn(
                  '[&_[data-slot=slider-track]]:bg-pink-100 dark:[&_[data-slot=slider-track]]:bg-pink-500/20',
                  '[&_[data-slot=slider-range]]:bg-pink-400 dark:[&_[data-slot=slider-range]]:bg-pink-400',
                  '[&_[data-slot=slider-thumb]]:border-pink-400 [&_[data-slot=slider-thumb]]:bg-white',
                  '[&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_rgba(244,114,182,0.16)]',
                  'dark:[&_[data-slot=slider-thumb]]:bg-slate-950 dark:[&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_rgba(236,72,153,0.22)]',
                )}
                onValueChange={(values) => {
                  const next = (values[0] ?? 100) / 100
                  setState((prev) => ({ ...prev, opacity: next }))
                }}
                onValueCommit={(values) => {
                  const next = (values[0] ?? 100) / 100
                  void handleSetState({ opacity: next })
                }}
              />
              <p className="mt-2 text-xs text-slate-400">
                透明度会立即作用到视频小窗，范围 20% 到 100%。
              </p>
            </div>
            <p className="text-xs text-slate-400">
              网页地址请直接在视频小窗内输入；这里仅保留窗口控制和播放设置。
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">播放快捷键</h2>
          <p className="mt-1 text-xs text-slate-400">这些快捷键是奇想盒全局注册的，不依赖视频网页焦点。</p>
          <div className="mt-4 space-y-3">
            <KeybindInput
              label="播放 / 暂停"
              value={state.playPauseKey}
              onChange={(value) => {
                void handleSetState({ playPauseKey: value })
              }}
              className="border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
            <KeybindInput
              label="快进"
              value={state.seekForwardKey}
              onChange={(value) => {
                void handleSetState({ seekForwardKey: value })
              }}
              className="border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
            <KeybindInput
              label="快退"
              value={state.seekBackwardKey}
              onChange={(value) => {
                void handleSetState({ seekBackwardKey: value })
              }}
              className="border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
            />
          </div>
        </section>
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}
