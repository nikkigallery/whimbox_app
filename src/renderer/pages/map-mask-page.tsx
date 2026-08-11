import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Box,
  Droplets,
  MapPinned,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'

import { ScrollCenterLayout } from 'renderer/components/scroll-center-layout'
import { SettingsPageLayout } from 'renderer/components/settings-page-layout'
import { Button } from 'renderer/components/ui/button'
import { Checkbox } from 'renderer/components/ui/checkbox'
import type {
  MapMaskLabelsResponse,
  MapMaskUserStatus,
} from 'renderer/types/map-mask'

type SetSelectedLabelsResponse = string[] | MapMaskLabelsResponse

const filters = [
  {
    id: 'pearpal_box',
    name: '宝箱',
    description: '显示尚未收集的宝箱',
    icon: Box,
    iconClassName:
      'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    id: 'pearpal_star',
    name: '奇想星',
    description: '显示尚未收集的奇想星',
    icon: Star,
    iconClassName:
      'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300',
  },
  {
    id: 'pearpal_dewdrop',
    name: '灵感露珠',
    description: '显示尚未收集的灵感露珠',
    icon: Droplets,
    iconClassName:
      'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300',
  },
] as const
const supportedLabelIds = new Set(filters.map(filter => filter.id))

const delay = (milliseconds: number) =>
  new Promise(resolve => {
    window.setTimeout(resolve, milliseconds)
  })

export function MapMaskPage() {
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingFilter, setUpdatingFilter] = useState(false)

  const loadFilters = useCallback(async () => {
    try {
      const response = (await window.App.rpc.request(
        'map_mask.get_labels'
      )) as MapMaskLabelsResponse
      const selected = response.selected_label_ids.filter(labelId =>
        supportedLabelIds.has(labelId as (typeof filters)[number]['id'])
      )
      setSelectedLabelIds(selected)
      if (selected.length !== response.selected_label_ids.length) {
        await window.App.rpc.request('map_mask.set_selected_labels', {
          label_ids: selected,
        })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '读取点位筛选设置失败'
      )
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFilters()
  }, [loadFilters])

  const waitForLogin = useCallback(async () => {
    let status = (await window.App.rpc.request(
      'map_mask.start_pearpal_login'
    )) as MapMaskUserStatus

    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (
        status.auth_state !== 'opening-login' &&
        status.auth_state !== 'loading-user-state'
      ) {
        break
      }
      await delay(500)
      status = (await window.App.rpc.request(
        'map_mask.get_user_status'
      )) as MapMaskUserStatus
    }

    if (status.auth_state !== 'authenticated' || !status.authenticated) {
      throw new Error(
        status.auth_error || '登录未完成，请重新打开地图遮罩后再试'
      )
    }
    return status
  }, [])

  const refreshUserState = useCallback(async () => {
    let status = (await window.App.rpc.request(
      'map_mask.refresh_pearpal_user_state'
    )) as MapMaskUserStatus

    for (let attempt = 0; status.refreshing && attempt < 120; attempt += 1) {
      await delay(250)
      status = (await window.App.rpc.request(
        'map_mask.get_user_status'
      )) as MapMaskUserStatus
    }

    if (status.refreshing) {
      throw new Error('刷新收集进度超时，请稍后重试')
    }
    if (status.refresh_error) {
      throw new Error(status.refresh_error)
    }
    return status
  }, [])

  const ensureUserSession = useCallback(async () => {
    const status = (await window.App.rpc.request(
      'map_mask.get_user_status'
    )) as MapMaskUserStatus

    if (status.authenticated) {
      try {
        return await refreshUserState()
      } catch {
        // An expired session is repaired by opening the website login window below.
      }
    }
    return waitForLogin()
  }, [refreshUserState, waitForLogin])

  const handleOpen = async () => {
    if (settingsLoading || opening || refreshing || updatingFilter) return
    setOpening(true)
    try {
      await ensureUserSession()
      await window.App.rpc.request('map_mask.set_hide_awarded', {
        hide_awarded: true,
      })
      await window.App.mapMaskOverlay?.show()
      toast.success('地图遮罩已打开，请回到游戏并打开大地图')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '打开地图遮罩失败')
    } finally {
      setOpening(false)
    }
  }

  const handleRefresh = async () => {
    if (settingsLoading || opening || refreshing || updatingFilter) return
    setRefreshing(true)
    try {
      await ensureUserSession()
      toast.success('收集进度已刷新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '刷新收集进度失败')
    } finally {
      setRefreshing(false)
    }
  }

  const handleFilterChange = async (labelId: string, checked: boolean) => {
    if (settingsLoading || opening || refreshing || updatingFilter) return
    const previous = selectedLabelIds
    const next = checked
      ? Array.from(new Set([...selectedLabelIds, labelId]))
      : selectedLabelIds.filter(id => id !== labelId)
    setSelectedLabelIds(next)
    setUpdatingFilter(true)
    try {
      const saved = (await window.App.rpc.request(
        'map_mask.set_selected_labels',
        {
          label_ids: next,
        }
      )) as SetSelectedLabelsResponse
      setSelectedLabelIds(
        Array.isArray(saved) ? saved : saved.selected_label_ids
      )
    } catch (error) {
      setSelectedLabelIds(previous)
      toast.error(error instanceof Error ? error.message : '更新点位筛选失败')
    } finally {
      setUpdatingFilter(false)
    }
  }

  const actionBusy = settingsLoading || opening || refreshing || updatingFilter

  return (
    <ScrollCenterLayout
      innerClassName="flex min-h-0 flex-1 flex-col gap-6 px-6 py-8 lg:px-10"
      scrollOuter
    >
      <SettingsPageLayout
        className="mx-auto w-full max-w-5xl"
        description="在游戏大地图上显示尚未收集的探索点位。"
        title="地图遮罩"
      >
        <div className="grid gap-6">
          <section className="overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-cyan-50 p-6 shadow-sm dark:border-pink-900/40 dark:from-pink-950/30 dark:via-slate-950 dark:to-cyan-950/30 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-pink-400 text-white shadow-lg shadow-pink-200/60 dark:shadow-pink-950/50">
                  <MapPinned className="size-6" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                  打开地图，即刻查看附近收集物
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  首次使用或登录失效时会自动打开网页登录窗口。完成登录后，遮罩会继续打开，无需手动复制账号信息。
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <Button
                  className="h-11 rounded-xl bg-pink-400 px-5 text-white shadow-sm hover:bg-pink-500 dark:bg-pink-500 dark:hover:bg-pink-400"
                  disabled={actionBusy}
                  onClick={() => void handleOpen()}
                  type="button"
                >
                  {opening ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <MapPinned className="size-4" />
                  )}
                  {opening ? '正在准备遮罩…' : '打开地图遮罩'}
                </Button>
                <Button
                  className="h-11 rounded-xl"
                  disabled={actionBusy}
                  onClick={() => void handleRefresh()}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw
                    className={refreshing ? 'size-4 animate-spin' : 'size-4'}
                  />
                  {refreshing ? '正在刷新…' : '刷新收集物'}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-5">
              <h2 className="font-semibold text-slate-900 dark:text-slate-50">
                显示点位
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                选择需要显示在游戏大地图上的收集物类型。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {filters.map(filter => {
                const Icon = filter.icon
                const checked = selectedLabelIds.includes(filter.id)
                return (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-4 transition-colors hover:border-pink-200 hover:bg-pink-50/50 has-[[data-state=checked]]:border-pink-200 has-[[data-state=checked]]:bg-pink-50/70 dark:border-slate-800 dark:hover:border-pink-900 dark:hover:bg-pink-950/20 dark:has-[[data-state=checked]]:border-pink-900 dark:has-[[data-state=checked]]:bg-pink-950/25"
                    htmlFor={`map-mask-filter-${filter.id}`}
                    key={filter.id}
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${filter.iconClassName}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                        {filter.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        {filter.description}
                      </span>
                    </span>
                    <Checkbox
                      checked={checked}
                      disabled={actionBusy}
                      id={`map-mask-filter-${filter.id}`}
                      onCheckedChange={value => {
                        void handleFilterChange(filter.id, value === true)
                      }}
                    />
                  </label>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
              <Sparkles className="size-5 text-pink-400" />
              <h2 className="font-semibold">使用方法</h2>
            </div>
            <ol className="mt-5 grid gap-4 text-sm text-slate-600 md:grid-cols-3 dark:text-slate-300">
              <Instruction index="1" title="打开遮罩">
                点击“打开地图遮罩”。如需登录，请在自动弹出的网页中完成操作。
              </Instruction>
              <Instruction index="2" title="进入大地图">
                回到游戏并打开大地图，未收集点位会自动显示并随地图拖动。
              </Instruction>
              <Instruction index="3" title="同步进度">
                收集后可等待自动同步，或点击“刷新收集物”立即更新显示结果。
              </Instruction>
            </ol>
          </section>
        </div>
      </SettingsPageLayout>
    </ScrollCenterLayout>
  )
}

function Instruction({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {index}
      </span>
      <span className="leading-6">
        <strong className="block font-medium text-slate-800 dark:text-slate-100">
          {title}
        </strong>
        {children}
      </span>
    </li>
  )
}
