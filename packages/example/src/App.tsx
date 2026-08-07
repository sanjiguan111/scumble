import "lynx-skity/elements";

// Minimal skity demo using the intrinsic tags directly (no component wrappers).
// <skity-canvas> renders via the skity GLES backend (TextureView + dedicated
// render thread on Android). Colors are 0xAARRGGBB.
export function App() {
  return (
    <view style={{ width: "100%", height: "100%", backgroundColor: "#ffffff" }}>
      <text style={{ fontSize: "20px", padding: "16px" }}>lynx-skity demo</text>
      <skity-canvas style={{ width: "100%", height: "400px" }}>
        {/* filled red rectangle */}
        <skity-rect x={20} y={20} width={140} height={90} fill={0xFFFF0000} />
        {/* filled blue circle */}
        <skity-circle cx={240} cy={100} r={55} fill={0xFF3B82F6} />
        {/* filled green triangle */}
        <skity-path d="M20 240 L160 180 L300 240 Z" fill={0xFF22C55E} />
        {/* stroked black rectangle inside a group */}
        <skity-group>
          <skity-rect
            x={40}
            y={40}
            width={100}
            height={50}
            stroke={0xFF000000}
            strokeWidth={4}
          />
        </skity-group>
      </skity-canvas>
      <text style={{ padding: "16px" }}>Rendered by skity GPU Backend.</text>
    </view>
  );
}
