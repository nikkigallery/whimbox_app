# Whimbox App ~ 奇想盒 APP
Whimbox，基于大语言模型和图像识别技术的AI智能体，辅助你游玩无限暖暖！\
想了解更多？请前往[奇想盒主页](https://nikkigallery.vip/whimbox/)

❗本项目为奇想盒的UI，仅提供交互界面，核心功能在[奇想盒后端项目](https://github.com/nikkigallery/Whimbox)

## 功能概览

- 主窗口：AI对话、脚本选择、功能设置等页面
- 悬浮窗：工具运行状态/日志的展示
- 运行后端：使用内置python环境运行奇想盒后端
- 自动更新：维护奇想盒前端和后端的更新

## 技术栈
- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui

## 环境要求
- Node.js 20+
- pnpm 10+

## 开发

安装依赖&运行
```bash
pnpm install
pnpm dev
```

构建产物

```bash
pnpm build
```

与后端联调
```
开发时不会使用内置python环境的奇想盒后端，需要先手动运行奇想盒后端项目
```

