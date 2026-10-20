# L2DEXtract

[中文](README.md)

Extract Live2DViewerEX `.lpk` packages and preview the resulting Live2D models. The desktop app is built with Electron, Vue 3, and TypeScript.

## What it does

- Extracts `STD2_0` and `STM_1_0`. Unknown or older packs are attempted as `STD_1_0`.
- Accepts a dropped `.lpk` and `config.json`. A `config.json` beside the `.lpk` is filled in automatically.
- Previews a model inside the app, or opens the same preview page in the system browser.

Steam Workshop batch extract, software rendering, and WPK are not in this version.

## Usage

1. On Extract, choose a `.lpk`. For a Workshop pack, also choose the `config.json` in the same folder. A normal pack can leave the config empty.
2. The output folder defaults to `Documents/L2DEXtract`.
3. Click Extract. When it finishes, open the output folder or go to Preview.
4. On Preview, choose the extracted character folder. The app looks for `*.model3.json` first, then `*.model.json`.

If a Workshop pack cannot be decrypted automatically, the app asks for a `fileId`. That is usually the numeric folder name in:

`steamapps/workshop/content/616720/<fileId>`

`.lpk` files are commonly found at:

- `steamapps/workshop/content/616720/...`
- `steamapps/common/Live2DViewerEX/shared/workshop/...`

A `.wpk` must be unpacked first so you have the `.lpk` and `config.json`. A few very old packs still cannot be extracted.

## Run from source

Node.js `^22.18.0` or `>=24.12.0`, and pnpm.

```sh
cd L2DEXtract-Electron
pnpm install
pnpm dev
```

## Package

From `L2DEXtract-Electron`:

```sh
pnpm dist
```

The Windows installer is written to `L2DEXtract-Electron/release`.
