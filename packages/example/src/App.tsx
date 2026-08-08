import { Canvas, Circle, Group, Path, Rect } from "@lynx-skity/react";

// skity demo via the @lynx-skity/react component layer (react-native-skity-style
// API: <Canvas><Circle color="red" /></Canvas>). Colors accept CSS strings and
// are packed to 0xAARRGGBB by lynx-skity/parsers at the component layer — the
// native side still only ever sees numbers.
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
        {/* filled green triangle */}
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
      </Canvas>
      <text style={{ padding: "16px" }}>Rendered by skity GPU Backend.</text>
    </view>
  );
}
