// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { useState } from "@lynx-js/react";

import { Canvas, Circle, Path, Rect, createAnimation } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// Heart via cubic beziers (same d string as PathsDemo/AnimationDemo).
const HEART =
  "M150 60 C100 20 30 40 30 100 C30 150 90 190 150 220 C210 190 270 150 270 100 C270 40 200 20 150 60 Z";

// Controlled specs: the SAME declarative tracks as AnimationDemo, but minted
// via createAnimation() — the returned spec carries a playback handle, and
// .controller is the imperative surface (invoke lane; zero JS per frame
// while playing — ANIMATION_CONTROL_DESIGN.md).
const trim = createAnimation({
  property: "pathEnd",
  from: 0,
  to: 1,
  duration: 2000,
  iterations: Infinity,
  easing: "ease-in-out",
});

const dotX = createAnimation({
  property: "translateX",
  from: 0,
  to: 220,
  duration: 1500,
  easing: "ease-in-out",
  fill: "forwards",
});
const dotOpacity = createAnimation({
  property: "opacity",
  from: 0,
  to: 1,
  duration: 400,
  fill: "forwards",
});

const btnStyle = {
  padding: "8px 14px",
  margin: "4px",
  backgroundColor: "#1e293b",
  color: "#e2e8f0",
  borderRadius: "8px",
  fontSize: "14px",
} as const;

function Controls() {
  return (
    <view style={{ flexDirection: "row", flexWrap: "wrap", marginTop: "8px" }}>
      <view bindtap={() => trim.controller.play()} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>▶ play</text>
      </view>
      <view bindtap={() => trim.controller.pause()} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>⏸ pause</text>
      </view>
      <view bindtap={() => trim.controller.seekTo(0)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>⏮ 0%</text>
      </view>
      <view bindtap={() => trim.controller.seekTo(500)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>25%</text>
      </view>
      <view bindtap={() => trim.controller.seekTo(1000)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>50%</text>
      </view>
      <view bindtap={() => trim.controller.seekTo(1500)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>75%</text>
      </view>
      <view bindtap={() => trim.controller.cancel()} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>✕ cancel</text>
      </view>
    </view>
  );
}

// Seek buttons double as a scrub bar for the one-shot dot; play() restarts
// the finished track, and the finish callback flips the badge.
function OneShotControls() {
  const [finished, setFinished] = useState(false);
  dotX.controller.onFinish(() => setFinished(true));

  const seek = (t: number) => {
    setFinished(false);
    dotX.controller.seekTo(t);
    dotOpacity.controller.seekTo(Math.min(t, 400));
  };

  return (
    <view style={{ flexDirection: "row", flexWrap: "wrap", marginTop: "8px" }}>
      <view
        bindtap={() => {
          setFinished(false);
          dotX.controller.play();
          dotOpacity.controller.play();
        }}
        style={btnStyle}
      >
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>▶ restart</text>
      </view>
      <view bindtap={() => seek(0)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>0ms</text>
      </view>
      <view bindtap={() => seek(750)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>mid</text>
      </view>
      <view bindtap={() => seek(1500)} style={btnStyle}>
        <text style={{ color: "#e2e8f0", fontSize: "14px" }}>end</text>
      </view>
      <text
        style={{
          padding: "8px 14px",
          margin: "4px",
          backgroundColor: finished ? "#22c55e" : "#334155",
          color: finished ? "#052e16" : "#94a3b8",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        {finished ? "onAnimationFinish ✓" : "waiting…"}
      </text>
    </view>
  );
}

export function PlaybackDemo() {
  return (
    <view>
      <DemoSection
        title="Playback control — pause / seek / cancel"
        caption="createAnimation().controller：invoke 通道命令；播放中每帧零 JS"
        height={240}
      >
        <Path path={HEART} color="#22c55e" style="stroke" strokeWidth={6} animate={trim} />
      </DemoSection>
      <Controls />

      <DemoSection
        title="One-shot + finish event"
        caption="fill:forwards 入场；seek 复活、play 重启；完成回调点亮徽标"
        height={80}
      >
        <Circle cx={40} cy={40} radius={16} color="#a855f7" animate={[dotX, dotOpacity]} />
      </DemoSection>
      <OneShotControls />

      <CancelSection />
    </view>
  );
}

// One component = one spec instance (minted once via useState): the Rect and
// its buttons share the handle. Re-minting per render would desync the
// controller from the node the tree last registered.
function CancelSection() {
  const [spec] = useState(() =>
    createAnimation({
      property: "translateX",
      from: 0,
      to: 200,
      duration: 3000,
      iterations: Infinity,
      autoReverse: true,
    }),
  );
  return (
    <view>
      <DemoSection
        title="Cancel returns to base"
        caption="cancel 后回到基础值（handle 保留）；再次 play 从头开始"
        height={80}
      >
        <Rect x={40} y={20} width={40} height={40} color="#f59e0b" animate={spec} />
      </DemoSection>
      <view style={{ flexDirection: "row", flexWrap: "wrap", marginTop: "8px" }}>
        <view bindtap={() => spec.controller.pause()} style={btnStyle}>
          <text style={{ color: "#e2e8f0", fontSize: "14px" }}>⏸ pause</text>
        </view>
        <view bindtap={() => spec.controller.play()} style={btnStyle}>
          <text style={{ color: "#e2e8f0", fontSize: "14px" }}>▶ play</text>
        </view>
        <view bindtap={() => spec.controller.cancel()} style={btnStyle}>
          <text style={{ color: "#e2e8f0", fontSize: "14px" }}>✕ cancel → base</text>
        </view>
      </view>
    </view>
  );
}
