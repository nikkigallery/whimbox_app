"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "renderer/lib/utils"

/** 将 KeyboardEvent 转为与 Python 后端一致的键名字符串 */
function formatKeyFromEvent(event: KeyboardEvent): string {
  const key = event.key
  const code = event.code
  const map: Record<string, string> = {
    " ": "space",
    Tab: "tab",
    Enter: "enter",
    Escape: "esc",
    Backspace: "backspace",
    Shift: "shift",
    Control: "control",
    Alt: "alt",
    Meta: "meta",
    CapsLock: "caps_lock",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Insert: "insert",
    Delete: "delete",
    Home: "home",
    End: "end",
    PageUp: "page_up",
    PageDown: "page_down",
    NumLock: "num_lock",
    F1: "f1",
    F2: "f2",
    F3: "f3",
    F4: "f4",
    F5: "f5",
    F6: "f6",
    F7: "f7",
    F8: "f8",
    F9: "f9",
    F10: "f10",
    F11: "f11",
    F12: "f12",
  }
  if (map[key] !== undefined) return map[key]
  if (key.length === 1) return key.toLowerCase()
  if (code.startsWith("Key")) return code.slice(3).toLowerCase()
  if (code.startsWith("Digit")) return code.slice(5)
  if (code.startsWith("Numpad")) return "numpad_" + code.slice(6).toLowerCase()
  return code.toLowerCase()
}

/** 将 MouseEvent.button 转为 mouse_left / mouse_right / mouse_middle */
function formatMouseButton(button: number): string {
  const  map: Record<number, string> = {
    0: "mouse_left",
    1: "mouse_middle",
    2: "mouse_right",
  }
  return map[button] ?? `mouse_x${button - 2}`
}

/** 全局只允许一组捕获：新开始捕获时先移除上一组的监听，避免连续改多个键位时旧 handler 仍响应同一按键 */
const currentCaptureRef = {
  keydown: null as ((e: KeyboardEvent) => void) | null,
  mousedown: null as ((e: MouseEvent) => void) | null,
}

function clearCurrentCapture() {
  if (currentCaptureRef.keydown) {
    window.removeEventListener("keydown", currentCaptureRef.keydown, true)
    currentCaptureRef.keydown = null
  }
  if (currentCaptureRef.mousedown) {
    window.removeEventListener("mousedown", currentCaptureRef.mousedown, true)
    currentCaptureRef.mousedown = null
  }
}

export type KeybindInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function KeybindInput({ label, value, onChange, className }: KeybindInputProps) {
  const [capturing, setCapturing] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const previousValueRef = useRef(value)

  useEffect(() => {
    setDisplayValue(value)
    previousValueRef.current = value
  }, [value])

  const startCapture = useCallback(() => {
    if (capturing) return
    previousValueRef.current = displayValue
    setCapturing(true)

    clearCurrentCapture()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDisplayValue(previousValueRef.current)
        setCapturing(false)
        clearCurrentCapture()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const keyStr = formatKeyFromEvent(e)
      setDisplayValue(keyStr)
      onChange(keyStr)
      setCapturing(false)
      clearCurrentCapture()
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        setDisplayValue(previousValueRef.current)
        setCapturing(false)
        clearCurrentCapture()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const keyStr = formatMouseButton(e.button)
      setDisplayValue(keyStr)
      onChange(keyStr)
      setCapturing(false)
      clearCurrentCapture()
    }

    currentCaptureRef.keydown = handleKeyDown
    currentCaptureRef.mousedown = handleMouseDown
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("mousedown", handleMouseDown, true)
  }, [capturing, displayValue, onChange])

  const displayText = capturing ? "请按下按键" : displayValue || "点击设置"

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50",
        className
      )}
    >
      <span className="text-sm text-slate-700 dark:text-slate-100">{label}</span>
      <button
        type="button"
        onClick={startCapture}
        className={cn(
          "min-w-[6rem] rounded-md border px-3 py-1.5 text-center text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500",
          capturing
            ? "border-pink-500 bg-pink-50 text-pink-700 dark:border-pink-500 dark:bg-pink-950/50 dark:text-pink-300"
            : "border-slate-200 bg-white text-slate-700 hover:border-pink-400 hover:bg-pink-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-pink-500 dark:hover:bg-pink-950/30"
        )}
      >
        {displayText}
      </button>
    </div>
  )
}
