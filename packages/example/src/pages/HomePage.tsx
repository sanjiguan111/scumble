import { useNavigate } from "react-router";

import { DEMOS } from "../demos";

// Gallery home: a scrollable list of demo categories. No Canvas previews here
// (mounting 6 GPU surfaces upfront is wasteful) — each demo renders on its
// detail page. Cards are simulated buttons: <view bindtap><text>.

export function HomePage() {
  const nav = useNavigate();
  return (
    <scroll-view style={{ width: "100%", height: "100%", backgroundColor: "#f9fafb" }} scroll-y>
      <view
        style={{
          paddingTop: "52px",
          paddingLeft: "16px",
          paddingRight: "16px",
          paddingBottom: "8px",
        }}
      >
        <text style={{ fontSize: "28px", fontWeight: "700", color: "#111827" }}>gesso</text>
        <text style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
          GPU vector graphics for Lynx — tap a category
        </text>
      </view>

      <view style={{ paddingTop: "8px", paddingLeft: "16px", paddingRight: "16px" }}>
        {DEMOS.map((d) => (
          <view
            key={d.key}
            bindtap={() => nav("/demo/" + d.key)}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              paddingTop: "16px",
              paddingBottom: "16px",
              paddingLeft: "16px",
              paddingRight: "16px",
              marginBottom: "12px",
            }}
          >
            <view
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "7px",
                backgroundColor: d.accent,
                marginRight: "14px",
              }}
            />
            <view style={{ flex: 1 }}>
              <text style={{ fontSize: "17px", fontWeight: "600", color: "#1f2937" }}>
                {d.title}
              </text>
              <text style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                {d.subtitle}
              </text>
            </view>
            <text style={{ fontSize: "22px", color: "#9ca3af" }}>›</text>
          </view>
        ))}
      </view>

      <text
        style={{
          fontSize: "12px",
          color: "#9ca3af",
          paddingLeft: "16px",
          paddingRight: "16px",
          paddingBottom: "28px",
          textAlign: "center",
        }}
      >
        rendered by skity GPU backend
      </text>
    </scroll-view>
  );
}
