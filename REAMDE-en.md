# L2DEXtract

[中文](README.md)

## Introduction

Extract Live2DViewerEX `.lpk` packages and preview the resulting Live2D models. The desktop app is built with Electron, Vue 3, and TypeScript.

- Extracts `STD2_0` and `STM_1_0`. Unknown or older packs are attempted as `STD_1_0`.
- Accepts a dropped `.lpk` and `config.json`. A `config.json` beside the `.lpk` is filled in automatically.
- Previews a model inside the app, or opens the same preview page in the system browser.

## Commands

Requires Node.js `^22.18.0` or `>=24.12.0` ( `22.18.0` recommended) and pnpm `11.7.0`. Run these in `L2DEXtract-Electron`, except the global pnpm install.

### Setup

```sh
node -v
pnpm -v
```

Print the Node.js and pnpm versions.

```sh
npm install -g pnpm@11.7.0
```

Install pnpm `11.7.0` globally. Skip this if that version is already installed.

```sh
pnpm install
```

Install dependencies. `postinstall` then downloads Electron for the current platform.

### Development

```sh
pnpm dev
```

Start the app in development mode. Code changes hot-reload.

```sh
pnpm preview
```

Preview the production build. Run `pnpm build` or `pnpm build-only` first.

### Checks

```sh
pnpm type-check
```

Type-check with vue-tsc.

```sh
pnpm lint
```

Run oxlint, then eslint, and auto-fix what they can.

```sh
pnpm format
```

Format `src/` with Prettier.

### Build and package

```sh
pnpm build-only
```

Build without type-checking. Output goes to `out/`.

```sh
pnpm build
```

Type-check, then build.

```sh
pnpm dist
```

Run `pnpm build`, then package a Windows NSIS installer with electron-builder. The installer is written to `L2DEXtract-Electron/release`.

## Disclaimer

This tool is for learning and for backing up model files you already obtained legally. Do not use it to crack, redistribute, or commercially exploit paid content that belongs to someone else. Copyright in the models and in Live2DViewerEX remains with their authors and rights holders. This project is not affiliated with Live2D Inc., Live2DViewerEX, or their authors. The software is provided "as is", with no liability for anything that results from using it.
