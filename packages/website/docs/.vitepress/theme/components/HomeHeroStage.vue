<!-- Licensed under the Apache License Version 2.0 that can be found in the
 LICENSE file in the root directory of this source tree.

 Hero visual: a mock "canvas" panel with pure-CSS animations (spinning
 gradient square, breathing gradient sphere, draw-on heart via stroke-dash
 trim) — echoing the native animation engine. Zero JS. -->
<template>
  <div class="stage" aria-hidden="true">
    <div class="bar">
      <i></i><i></i><i></i><span>AnimationDemo.lynx</span>
    </div>
    <div class="scene">
      <div class="spin-sq"></div>
      <div class="pulse-circle"></div>
      <div class="heart-wrap">
        <svg width="150" height="140" viewBox="0 0 300 280">
          <path
            class="heart-path"
            d="M150 60 C100 20 30 40 30 100 C30 150 90 190 150 220 C210 190 270 150 270 100 C270 40 200 20 150 60 Z"
          />
        </svg>
      </div>
    </div>
    <span class="perf">0 JS / frame</span>
    <span class="tag">render thread · vsync</span>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  max-width: 440px;
  aspect-ratio: 10 / 8.4;
  overflow: hidden;
  border: 1px solid #2a3765;
  border-radius: 14px;
  background:
    linear-gradient(transparent 23px, rgba(36, 48, 89, 0.35) 24px, transparent 25px)
      0 0 / 100% 24px,
    linear-gradient(
      90deg,
      transparent 23px,
      rgba(36, 48, 89, 0.35) 24px,
      transparent 25px
    )
      0 0 / 24px 100%,
    #0e1428;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  font-family:
    ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
}

.bar {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-bottom: 1px solid #2a3765;
  background: rgba(21, 29, 64, 0.7);
}
.bar i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2a3765;
}
.bar i:first-child {
  background: #ff5f57;
}
.bar i:nth-child(2) {
  background: #febc2e;
}
.bar i:nth-child(3) {
  background: #28c840;
}
.bar span {
  margin-left: 8px;
  font-size: 11px;
  color: #7683b3;
}

.scene {
  position: absolute;
  inset: 34px 0 0;
}

/* spinning square — echoes the native animation engine */
.spin-sq {
  position: absolute;
  left: 16%;
  top: 22%;
  width: 88px;
  height: 88px;
  border-radius: 16px;
  background: linear-gradient(140deg, #fbbf24, #f59e0b);
  box-shadow: 0 10px 30px rgba(245, 158, 11, 0.35);
  animation: spin 7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* breathing gradient circle */
.pulse-circle {
  position: absolute;
  right: 14%;
  top: 16%;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #93c5fd, #3b82f6 58%, #1d4ed8);
  box-shadow: 0 12px 34px rgba(59, 130, 246, 0.4);
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    transform: scale(0.82);
    opacity: 0.75;
  }
}

/* draw-on heart (stroke dash trim) */
.heart-wrap {
  position: absolute;
  left: 26%;
  bottom: 6%;
}
.heart-wrap svg {
  display: block;
}
.heart-path {
  fill: none;
  stroke: #34d399;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 0 660;
  animation: draw 2.8s ease-in-out infinite;
}
@keyframes draw {
  0% {
    stroke-dasharray: 0 660;
  }
  70% {
    stroke-dasharray: 660 0;
  }
  100% {
    stroke-dasharray: 660 0;
  }
}

.tag {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11px;
  color: #7683b3;
}
.perf {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-size: 11px;
  color: #2dd4bf;
}
</style>
