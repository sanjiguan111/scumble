import { useNavigate, useParams } from "react-router";

import { findDemo } from "../demos";

// Layout: the back bar is absolutely pinned to the top — it sits below the
// status bar on iOS (where LynxView fills the whole screen per ViewController.m,
// so the top ~44px is covered by the status bar); on Android the host already
// places LynxView below the status bar, so the inset is just harmless extra air.
// The scroll-view fills the screen and pads its top so content starts below the
// fixed bar. This avoids relying on scroll-view flex:1 (inconsistent in Lynx).

const STATUS_INSET = 44;
const BAR_CONTENT = 44;
const PLACEHOLDER = STATUS_INSET + BAR_CONTENT + 1; // +1 for the divider line

export function DemoPage() {
  const { key } = useParams();
  const nav = useNavigate();
  const demo = findDemo(key);

  return (
    <view style={{ width: "100%", height: "100%", backgroundColor: "#ffffff" }}>
      <view
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          right: "0px",
          zIndex: 10,
          backgroundColor: "#ffffff",
        }}
      >
        <view style={{ height: STATUS_INSET + "px" }} />
        <view
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: "8px",
            paddingRight: "12px",
            paddingBottom: "12px",
          }}
        >
          <text
            style={{
              fontSize: "16px",
              color: "#3b82f6",
              paddingTop: "6px",
              paddingBottom: "6px",
              paddingLeft: "8px",
              paddingRight: "8px",
            }}
            bindtap={() => nav(-1)}
          >
            ← 返回
          </text>
          <text
            style={{ fontSize: "17px", fontWeight: "600", color: "#1f2937", marginLeft: "4px" }}
          >
            {demo ? demo.title : "Unknown"}
          </text>
        </view>
        <view style={{ height: "1px", backgroundColor: "#e5e7eb" }} />
      </view>

      <scroll-view style={{ width: "100%", height: "100%" }} scroll-y>
        <view style={{ height: PLACEHOLDER + "px" }} />
        {demo ? (
          demo.render()
        ) : (
          <view style={{ paddingLeft: "16px", paddingRight: "16px" }}>
            <text style={{ fontSize: "15px", color: "#6b7280" }}>未知 demo: {key}</text>
            <text
              style={{ fontSize: "15px", color: "#3b82f6", marginTop: "16px" }}
              bindtap={() => nav("/")}
            >
              返回首页
            </text>
          </view>
        )}
      </scroll-view>
    </view>
  );
}
