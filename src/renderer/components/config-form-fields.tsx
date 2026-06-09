import { useEffect, useRef, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
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
  onValueChange: (key: string, value: string | number | boolean | string[]) => void
  loading: boolean
  loadError: string
  /** 空状态提示 */
  emptyMessage?: string
  /** 表单项容器 className，用于区分整页（如 bg-slate-50）与弹窗内（如 bg-white） */
  itemClassName?: string
}

type MultiSelectInputProps = {
  options: string[]
  value: string[]
  placeholder?: string
  onChange: (value: string[]) => void
}

function MultiSelectInput({
  options,
  value,
  placeholder = "请选择",
  onChange,
}: MultiSelectInputProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const displayValue = value.length > 0 ? value.join(" , ") : ""

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        wrapperRef.current &&
        !wrapperRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const toggleOption = (option: string, checked: boolean) => {
    const nextValue = checked
      ? [...value, option]
      : value.filter((item) => item !== option)
    onChange(Array.from(new Set(nextValue)))
  }

  return (
    <div ref={wrapperRef} className="relative w-full min-w-[200px]">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          "border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
          "focus-visible:border-pink-400 focus-visible:ring-[3px] focus-visible:ring-pink-200/70"
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            displayValue ? "text-slate-700 dark:text-slate-100" : "text-muted-foreground"
          )}
          title={displayValue}
        >
          {displayValue || placeholder}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-800 dark:bg-slate-900">
          {options.map((option, index) => (
            <label
              key={`${option}-${index}`}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Checkbox
                checked={value.includes(option)}
                onCheckedChange={(checked) =>
                  toggleOption(option, checked === true)
                }
                className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
              />
              <span className="min-w-0 flex-1 truncate">{option}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
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
        const selectedValues = Array.isArray(value)
          ? value.map(String)
          : meta.type === "array" && value === "全部"
            ? options
            : typeof value === "string" && value.length > 0 && value !== "不做周本"
              ? [value]
              : []

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
              {meta.type === "array" && options.length > 0 ? (
                <MultiSelectInput
                  options={options}
                  value={selectedValues}
                  onChange={(nextValue) => onValueChange(key, nextValue)}
                />
              ) : booleanLike ? (
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Checkbox
                    checked={String(value) === "true"}
                    onCheckedChange={(checked) =>
                      onValueChange(key, checked ? "true" : "false")
                    }
                    className="data-[state=checked]:bg-pink-400 data-[state=checked]:border-pink-400 data-[state=checked]:text-white"
                  />
                  {/* {String(value) === "true" ? "开启" : "关闭"} */}
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
