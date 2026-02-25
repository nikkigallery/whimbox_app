# Whimbox App (Frontend)

Whimbox 桌面端前端工程，基于 Electron + React + TypeScript。
该工程负责主窗口、悬浮窗、以及与 Python 后端 RPC 的事件桥接与展示。

## 功能概览

- 主窗口：首页对话、脚本选择、设置等页面
- 悬浮窗：运行中状态/日志展示与控制
- 对话流：展示模型文本输出
- 工具日志流：按每次工具调用独立分框展示
- 任务控制：开始、停止、运行结果回显

## 技术栈

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui
- react-activation（KeepAlive）

## 环境要求

- Node.js 20+
- pnpm 10+

## 安装与启动

```bash
pnpm install
pnpm dev
```

## 构建产物

```bash
pnpm build
```

## 目录结构

- `src/main`：Electron 主进程
  - `services/rpc-client.ts`：与 Python 后端建立 RPC 连接
  - `services/rpc-bridge.ts`：转发并标准化 RPC 事件，驱动窗口/悬浮窗行为
  - `windows/overlay.ts`：悬浮窗生命周期与显示控制
- `src/preload`：向渲染进程暴露安全 API
- `src/renderer`：React 渲染层
  - `hooks/use-home-conversation.ts`：对话消息与工具日志聚合
  - `components/conversation-panel.tsx`：对话/日志渲染与滚动行为
  - `pages/home-page.tsx`：输入、发送、焦点管理

## 事件模型（当前）

前端主流程已统一到以下事件：

- `event.agent.message`
  - 用途：模型文本增量输出
- `event.run.status`
  - 用途：工具/任务运行状态
  - 关键字段：`phase`（如 `started/stopping/completed/cancelled/error`）、`source`
- `event.run.log`
  - 用途：工具日志与日志块更新
  - 关键字段：`type`（如 `add/update/finalize_ai_message`）、`tool_call_id`


## 联调说明

需要先手动运行[Whimbox python后端项目](https://github.com/nikkigallery/Whimbox)

