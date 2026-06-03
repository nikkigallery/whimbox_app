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

## macOS 常见问题

**Q: 为什么下载解压后，双击运行提示“已损坏，打不开。您应该将它移到废纸篓”？**

这是因为 macOS 会自动为浏览器下载的文件附加隔离属性（Quarantine），而当前应用使用的是无证书（Ad-hoc）签名。macOS 出于安全机制会直接阻止无证书且带有隔离属性的应用运行，并统一报错为“文件已损坏”。**这并不代表文件真的损坏，也不会在“隐私与安全性”中显示拦截记录。**

**解决办法：**
打开「终端」(Terminal)，输入以下命令（注意将路径替换为你实际存放 App 的路径），然后回车即可正常打开：
```bash
xattr -cr /Applications/whimbox_app.app
```
*(提示：您可以输入 `xattr -cr ` 后，将 whimbox_app.app 拖入终端窗口来自动生成路径)*
