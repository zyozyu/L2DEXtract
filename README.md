# L2DEXtract

[English](REAMDE-en.md)

## 项目介绍

解包 `.lpk` 格式文件，并在窗口里预览解出来的 Live2D 模型。桌面端使用 Electron、Vue 3 和 TypeScript。

- 解包 `STD2_0`、`STM_1_0`，未知或更早的包按 `STD_1_0` 尝试
- 拖入 `.lpk` 和 `config.json`，同目录的 `config.json` 会自动填上
- 在软件里预览模型，也可以用系统浏览器打开同一预览页

## 相关指令

环境要求：Node.js `^22.18.0` 或 `>=24.12.0`，建议 `22.18.0`；pnpm `11.7.0`。除安装 pnpm 外，命令都在 `L2DEXtract-Electron` 目录执行。

### 环境

```sh
node -v
pnpm -v
```

查看 Node.js 和 pnpm 版本。

```sh
npm install -g pnpm@11.7.0
```

全局安装 pnpm `11.7.0`。版本已符合可跳过。

```sh
pnpm install
```

安装依赖。结束后自动执行 `postinstall`，下载当前平台的 Electron。

### 开发

```sh
pnpm dev
```

启动开发模式。修改代码后热更新。

```sh
pnpm preview
```

预览已构建的生产包。需先执行 `pnpm build` 或 `pnpm build-only`。

### 检查

```sh
pnpm type-check
```

用 vue-tsc 做类型检查。

```sh
pnpm lint
```

依次运行 oxlint 和 eslint，并自动修复能修的问题。

```sh
pnpm format
```

用 Prettier 格式化 `src/`。

### 构建与打包

```sh
pnpm build-only
```

只构建，不做类型检查。产物在 `out/`。

```sh
pnpm build
```

先类型检查，再构建。

```sh
pnpm dist
```

先执行 `pnpm build`，再用 electron-builder 打 Windows NSIS 安装包。安装包在 `L2DEXtract-Electron/release`。

## 免责声明

- 本工具仅可用于**个人学习研究**，以及备份您已合法获得授权的模型文件。
- 严禁使用本工具实施破解、盗取、二次分发、商用或其他侵犯第三方知识产权的行为。
- 相关模型资源、Live2DViewerEX 的著作权及其他知识产权归属其原作者与合法权利人。
- 如因使用者违规使用本工具引发任何版权纠纷、民事或刑事责任，均由使用者自行承担，与 L2DEXtract 软件作者无关。

test rule