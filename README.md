## 奇想盒（Whimbox）桌面端

基于 Electron + React + TypeScript + Tailwind + shadcn/ui + Vite 的桌面端 AI Agent 界面工程。当前实现了原型图中的整体布局与样式结构，包括左侧导航、主内容区、快捷卡片与底部输入区域。

## 技术栈

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui（基础组件风格）
- lucide-react 图标

## 本地开发

```bash
pnpm install
pnpm dev
```

## 构建打包

```bash
pnpm build
```

## 项目结构

- `src/main`：Electron 主进程
- `src/preload`：预加载脚本（上下文桥）
- `src/renderer`：渲染进程（React UI）
  - `screens/main.tsx`：主界面布局
  - `globals.css`：全局样式与主题变量

## 说明

- 当前为 UI 原型落地版本，交互与业务逻辑待补充。
- 设计参考：用户提供的原型图。
