import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "renderer/components/ui/combobox"
import { Spinner } from "renderer/components/ui/spinner"
import { Checkbox } from "renderer/components/ui/checkbox"
import { Input } from "renderer/components/ui/input"
import { isBooleanLike, type ConfigMetaItem, type ConfigSection } from "renderer/hooks/use-config-form"
import { cn } from "renderer/lib/utils"

type ConfigFormFieldsProps = {
  items: ConfigMetaItem[]
  draftConfig: ConfigSection | null
  onValueChange: (key: string, value: string | number | boolean) => void
  loading: boolean
  loadError: string
  /** 空状态提示 */
  emptyMessage?: string
  /** 表单项容器 className，用于区分整页（如 bg-slate-50）与弹窗内（如 bg-white） */
  itemClassName?: string
}

export function ConfigFormFields({
  items,
  draftConfig,
  onValueChange,
  loading,
  loadError,
  emptyMessage = "暂无可用配置",
  itemClassName = "rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900",
}: ConfigFormFieldsProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner className="size-4" />
        正在读取配置...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        {loadError}
      </div>
    )
  }

  if (items.length === 0) {
    return <div className="text-sm text-slate-400">{emptyMessage}</div>
  }

  return (
    <div className="space-y-3">
      {items.map((meta) => {
        const key = meta.key
        const value = draftConfig?.[key]?.value ?? ""
        const booleanLike = meta.type === "boolean" || isBooleanLike(value)
        const label = meta.description || key
        const options = meta.options ?? []
        return (
          <div
            key={key}
            className={cn("flex flex-col gap-2", itemClassName)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-100">
                  {label}
                </div>
              </div>
              {booleanLike ? (
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Checkbox
                    checked={String(value) === "true"}
                    onCheckedChange={(checked) =>
                      onValueChange(key, checked ? "true" : "false")
                    }
                    className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
                  />
                  {String(value) === "true" ? "开启" : "关闭"}
                </label>
              ) : options.length > 0 ? (
                <Combobox
                  items={options}
                  value={
                    options.includes(String(value)) ? String(value) : null
                  }
                  inputValue={String(value)}
                  onValueChange={(nextValue) =>
                    onValueChange(key, nextValue ? String(nextValue) : "")
                  }
                  onInputValueChange={(inputValue) =>
                    onValueChange(key, inputValue)
                  }
                >
                  <ComboboxInput
                    className="w-full min-w-[200px]"
                    placeholder="请输入或选择"
                  />
                  <ComboboxContent>
                    <ComboboxList>
                      {(option, index) => (
                        <ComboboxItem
                          key={`${String(option)}-${index}`}
                          value={option}
                        >
                          {String(option)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                    <ComboboxEmpty>没有匹配项</ComboboxEmpty>
                  </ComboboxContent>
                </Combobox>
              ) : (
                <Input
                  value={String(value)}
                  onChange={(event) =>
                    onValueChange(key, event.target.value)
                  }
                  className="min-w-[200px]"
                  type="text"
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
