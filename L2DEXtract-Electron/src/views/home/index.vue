<script setup lang="ts"></script>

<template>
  <section class="home">
    <div class="copy">
      <p class="kicker">Live2DViewerEX</p>
      <h1>把 <span class="ext">.lpk</span> 拆开</h1>
      <p class="lead">解包模型包，并在这个窗口里预览角色。</p>

      <div class="paths">
        <RouterLink class="path" to="/extract">
          <span class="path-name">解包</span>
          <span class="path-desc">选择或拖入 .lpk。工坊包会带上同目录的 config.json。</span>
          <span class="path-go">开始解包</span>
        </RouterLink>
        <RouterLink class="path" to="/preview">
          <span class="path-name">预览</span>
          <span class="path-desc">打开解出来的角色目录，切换表情和动作。</span>
          <span class="path-go">打开预览</span>
        </RouterLink>
      </div>

      <p class="note">
        <code>STD2_0</code>、<code>STM_1_0</code> 直接解。认不出的包按 <code>STD_1_0</code> 试。
      </p>
    </div>

    <div class="stage">
      <div class="legend">
        <p>图层</p>
        <ul>
          <li><i class="swatch body"></i>身体</li>
          <li><i class="swatch hair"></i>头发</li>
          <li><i class="swatch face"></i>脸</li>
        </ul>
        <p class="hint">悬停后重合</p>
      </div>

      <svg class="model" viewBox="-28 -36 336 430">
        <g class="part part-body">
          <path
            class="shape"
            d="M118 188 H162 C172 214 190 232 214 246 L232 274 C222 318 186 346 140 352 C94 346 58 318 48 274 L66 246 C90 232 108 214 118 188 Z"
          />
          <path d="M118 188 H162 M140 188 V352 M78 250 H202 M58 300 H222" />
        </g>
        <g class="part part-hair">
          <path
            class="shape"
            d="M140 26 C98 22 64 56 56 102 C50 142 58 176 52 224 L82 240 L94 184 C86 156 92 124 108 108 C120 96 130 92 140 94 C150 92 160 96 172 108 C188 124 194 156 186 184 L198 240 L228 224 C222 176 230 142 224 102 C216 56 182 22 140 26 Z"
          />
          <path d="M140 26 V94 M72 96 H208 M56 150 H96 M184 150 H224 M52 224 L82 240 M228 224 L198 240" />
        </g>
        <g class="part part-face">
          <path
            class="shape"
            d="M140 50 C178 50 202 82 204 122 C206 164 186 200 140 216 C94 200 74 164 76 122 C78 82 102 50 140 50 Z"
          />
          <path d="M140 50 V216 M96 92 H184 M84 128 H196 M104 168 H176" />
          <circle class="hub" cx="140" cy="204" r="3.2" />
          <circle class="hub-ring" cx="140" cy="204" r="7" />
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.home {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.95fr);
  gap: 20px;
}

.copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 8px 12px 8px 20px;
}

.kicker {
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #5d7282;
}

h1 {
  margin: 0;
  font-size: 48px;
  font-weight: 650;
  line-height: 1.15;
  color: #17202b;
}

.ext {
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 0.72em;
  font-weight: 500;
  color: #1e5168;
}

.lead {
  margin: 14px 0 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.paths {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 32px;
}

.path {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 132px;
  padding: 16px 16px 14px;
  text-decoration: none;
  color: inherit;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

.path:hover {
  border-color: #1e5168;
}

.path:focus-visible {
  outline: 2px solid #1e5168;
  outline-offset: 3px;
}

.path-name {
  font-size: 16px;
  font-weight: 650;
}

.path-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.path-go {
  margin-top: auto;
  font-size: 13px;
  font-weight: 650;
  color: #1e5168;
}

.note {
  margin: 22px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.note code {
  font-family: 'Cascadia Code', 'Sarasa Mono SC', ui-monospace, Consolas, monospace;
  font-size: 12px;
  color: #1e5168;
}

.stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 28px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background-color: #eef3f6;
  background-image:
    linear-gradient(45deg, #e2eaef 25%, transparent 25%),
    linear-gradient(-45deg, #e2eaef 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e2eaef 75%),
    linear-gradient(-45deg, transparent 75%, #e2eaef 75%);
  background-size: 22px 22px;
  background-position:
    0 0,
    0 11px,
    11px -11px,
    -11px 0;
  animation: rise 0.45s ease both;
}

.legend {
  position: absolute;
  top: 22px;
  left: 22px;
  z-index: 1;
}

.legend p {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.12em;
  color: #3e5566;
}

.legend ul {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #243646;
}

.swatch {
  width: 10px;
  height: 10px;
  border: 1px solid #1e5168;
  border-radius: 2px;
}

.swatch.body {
  background: #d5e3ec;
}

.swatch.hair {
  background: #7ea8bf;
}

.swatch.face {
  background: #fff;
}

.model {
  display: block;
  width: min(78%, 390px);
  height: auto;
  margin: 0 auto;
  overflow: hidden;
}

.part {
  fill: none;
  stroke: #1e5168;
  stroke-width: 1.35;
  stroke-linejoin: round;
  transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.part path {
  fill: none;
}

.part .shape {
  fill: inherit;
}

.part-body {
  fill: #d5e3ec;
  transform: translate(0, 24px);
}

.part-hair {
  fill: #7ea8bf;
  transform: translate(0, -24px);
}

.part-face {
  fill: #fff;
}

.stage:hover .part-body,
.stage:hover .part-hair,
.stage:hover .part-face {
  transform: translate(0, 0);
}

.hub {
  fill: #c4533c;
  stroke: none;
}

.hub-ring {
  fill: none;
  stroke: #c4533c;
  stroke-width: 1.2;
}

.hint {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #3e5566;
}

@media (max-width: 980px) {
  .home {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .stage {
    min-height: 460px;
  }

  .paths {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage {
    animation: none;
  }

  .part,
  .part-body,
  .part-hair,
  .part-face,
  .stage:hover .part-body,
  .stage:hover .part-hair,
  .stage:hover .part-face {
    transform: none;
    transition: none;
  }

  .hint {
    display: none;
  }
}

@keyframes rise {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
