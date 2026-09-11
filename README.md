# GeoBox 地理课件舱

面向希沃白板大屏授课场景的**地理交互式可视化课件运行时 + 课件库管理器**（Windows 桌面端，开源 MIT）。

- 📦 **统一课件包格式 `.gpak`**：预置课件与用户课件同权——你用 vibe coding 写的 HTML 网页程序，补一个 `manifest.json` 即可导入管理
- 🖥️ **大屏授课优化**：全屏播放器、触控友好、离线可用
- 🔌 **桥接 API `window.geobox`**：课件可导入真实地理数据（DEM/GeoJSON）、做课件级持久化
- 💾 **本地优先**：SQLite 存储课件库，架构预留云端 API 抽象层（社区功能后置）
- 🔗 **单文件分享**：导出 `.gpak`，双击即导入另一台电脑

## 技术栈

Electron · React 18 · TypeScript · Vite（electron-vite）· Three.js（课件运行时）· node:sqlite

## 开发

```bash
npm install   # 自动执行 postinstall：把 three.js 运行时复制到课件 assets（课件离线可用）
npm run dev      # 开发模式（热更新）
npm run build    # 构建
npm run dist     # 打包 Windows 安装包（electron-builder）
```

## 课件包格式 `.gpak`

一个 `.gpak` 就是一个 ZIP：

```
课件名.gpak
├── manifest.json   # id/名称/作者/标签/入口/权限
├── index.html      # 入口页面
└── assets/         # JS/CSS/数据文件
```

`samples/demo-courseware/` 是一个最小示例课件，可用「从文件夹导入」直接体验。

## 课件桥接 API

```js
// 调起系统对话框导入真实地理数据（DEM/GeoJSON 等）
const file = await window.geobox.importFile({ accept: ['.tif', '.asc', '.geojson'] })
// 课件级持久化
await window.geobox.storage.set('progress', JSON.stringify({ step: 3 }))
// 全屏 / 退出
await window.geobox.setFullscreen(true)
await window.geobox.exit()
```

普通 HTML 课件不调用桥接也能正常运行。

## 路线图

- [x] P0 工程骨架：课件库 + 导入导出 + 沙箱播放器
- [x] P1 预置课件：等高线 3D 沙盘（虚拟地形/实时等高线/剖面测量/DEM 导入，见 `courseware/contour-sandbox/`）
- [ ] P2 预置课件扩充：地球运动模拟器、时区换算器、水循环
- [ ] P3 v1.0 发布
- [ ] P4 云端社区（另立项）

详见 [架构方案与路线图.md](./架构方案与路线图.md)
