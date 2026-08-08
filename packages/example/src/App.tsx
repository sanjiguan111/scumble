import { Canvas, Circle, Group, Path, Rect } from "@lynx-skity/react";

// skity demo via the @lynx-skity/react component layer (react-native-skity-style
// API: <Canvas><Circle color="red" /></Canvas>). Colors accept CSS strings and
// are packed to 0xAARRGGBB by lynx-skity/parsers at the component layer; path d
// and transform are parsed to nested FlatBuffer bytes there, then base64-encoded
// for Lynx's string prop channel (Lynx doesn't marshal NSData); the native side
// only ever sees numbers and base64 strings, never raw structure strings.
import "lynx-skity/elements";

export function App() {
  return (
    <view style={{ width: "100%", height: "100%", backgroundColor: "#ffffff" }}>
      <text style={{ fontSize: "20px", padding: "16px" }}>lynx-skity demo</text>
      <Canvas style={{ width: "100%", height: "400px" }}>
        {/* filled red rectangle */}
        <Rect x={20} y={20} width={140} height={90} color="#ff0000" />
        {/* filled blue circle */}
        <Circle cx={240} cy={100} radius={55} color="#3b82f6" />
        {/* filled green triangle (path d → nested FlatBuffer → base64) */}
        <Path path="M20 240 L160 180 L300 240 Z" color="#22c55e" />
        {/* stroked black rectangle inside a group */}
        <Group>
          <Rect
            x={40}
            y={40}
            width={100}
            height={50}
            color="#000000"
            style="stroke"
            strokeWidth={4}
          />
        </Group>
        {/* arc with concatenated flags (large=1 sweep=1 written as "11") —
            exercises the parser's single-digit flag handling end to end. */}
        <Path path="M250 250A40 40 0 11330 250" color="#a855f7" />
      </Canvas>
      <text style={{ fontSize: "16px", padding: "16px" }}>
        viewport demo — 100×100 logical space scaled to fit
      </text>
      {/* viewPort declares a 100×100 logical coordinate space; the renderer
          scales child geometry (authored in those logical px) to fit the canvas.
          preserveAspectRatio defaults to xMidYMid meet. */}
      <Canvas style={{ width: "100%", height: "160px" }} viewPort={{ width: 100, height: 100 }}>
        <Rect x={5} y={5} width={40} height={40} color="#ef4444" />
        <Circle cx={70} cy={30} radius={20} color="#3b82f6" />
        <Path path="M5 95 L50 60 L95 95 Z" color="#22c55e" />
      </Canvas>
      <text style={{ padding: "16px" }}>Rendered by skity GPU Backend.</text>
    </view>
  );
}
