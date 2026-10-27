# L2DEXtract

[English](REAMDE-en.md)

解包 Live2DViewerEX 的 `.lpk`，并在窗口里预览解出来的 Live2D 模型。桌面端使用 Electron、Vue 3 和 TypeScript。

## 能做什么

- 解包 `STD2_0`、`STM_1_0`，未知或更早的包按 `STD_1_0` 尝试
- 把 `.lpk` 和 `config.json` 拖进窗口，同目录的 `config.json` 会自动填上
- 在软件里预览模型，也可以用系统浏览器打开同一预览页

Steam 创意工坊批量解包、软件渲染、WPK 还不在这个版本里。

## 使用

1. 在「解包」里选择 `.lpk`。工坊包再选同目录的 `config.json`。普通包可以不填配置。
2. 输出目录默认是「文档/L2DEXtract」。
3. 点「开始解包」。完成后可以打开输出目录，或进入「预览」。
4. 在「预览」里选择解出来的角色目录。优先找 `*.model3.json`，其次 `*.model.json`。

工坊包如果自动解密失败，会要求填写 `fileId`。它一般是下面路径里的数字目录名：

`steamapps/workshop/content/616720/<fileId>`

`.lpk` 常见位置：

- `steamapps/workshop/content/616720/...`
- `steamapps/common/Live2DViewerEX/shared/workshop/...`

`.wpk` 需要先自行解压，拿到里面的 `.lpk` 和 `config.json` 再解包。少部分早期包仍可能解不开。

## 从源码运行

建议 Node.js `22.18.0`、pnpm `11.7.0`。

```sh
# 查看nodejs和pnpm版本
node -v
pnpm -v

# 安装pnpm11.7.0
npm install -g pnpm@11.7.0

# 安装依赖
cd L2DEXtract-Electron
pnpm install

# 启动项目
pnpm dev
```

## 打包

在 `L2DEXtract-Electron` 目录执行：

```sh
pnpm dist
```

Windows 安装包生成在 `L2DEXtract-Electron/release`。
