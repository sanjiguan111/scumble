# lynx-skity 渲染架构与演进 Plan

> 状态：基础渲染 + 数据流已通（Android OpenGL ES/Vulkan + iOS Metal，2026-08-07 跑通）。
> 本文记录**功能开发阶段**的目标架构、设计原则与工作分解，供后续持续推进。

---

## 1. 目标架构

**声明式标签 + 局部二进制序列化 + viewport 逻辑坐标系。**

一句话核心原则：

> **原生侧永不出现「字符串 → 结构」的解析；所有字符串解析都发生在前端 JS。**

顺着这条线，每个属性的归属就自然确定。这套架构既保留了标签模式的声明式组合能力（children 嵌套、measure、可读性），又让「重解析、重数据」的部分以二进制直达渲染层，对标 `react-native-svg` / `react-native-skia` 的成熟分层。

## 2. 分层

```
┌─────────────────────────────────────────────────────┐
│  @lynx-skity/react        @lynx-skity/vue           │  框架包装层（各自独立 npm 包）
│  <Circle fill="#fff"/>    <Circle fill="#fff"/>      │  人体工程学 / 默认值 / ref / 动画接入
└───────────────┬───────────────────┬─────────────────┘
                │   复用同一套解析    │
        ┌───────▼───────────────────▼─────────┐
        │  @lynx-skity/parsers (纯 JS, 无框架) │  parser/normalizer 共享层
        │  color→int · path d→PathCmd[] ·       │  React/Vue 不重复造轮子
        │  transform→TransformOp[] · gradient  │
        └───────┬───────────────────────────────┘
                │  产出「基础值」(int/float/ArrayBuffer)
        ┌───────▼───────────────────────────────┐
        │  lynx-skity  (底层契约层，框架无关)     │  intrinsic 标签 + elements.ts 类型
        │  <skity-circle cx cy r fill=0xAARRGGBB> │  原生只认 int/float/二进制，零字符串解析
        │  ─── FlatBuffer skityrt::RenderTree ─── │
        └─────────────────────────────────────────┘
```

依赖方向单向无环：`@lynx-skity/{react,vue}` → `@lynx-skity/parsers` → `lynx-skity`（标签契约）。

## 3. 职责划分

| 数据性质 | 例子 | 归属 | 传输方式 |
|---|---|---|---|
| 无解析标量 | 颜色 `0xAARRGGBB`、几何 `cx/cy/r/x/y/w/h`、`strokeWidth`、枚举 byte | 底层标签 prop（不变） | `@LynxProp` number |
| 需解析 / 嵌套结构 | path `d`、CSS `transform`、`Gradient`、`Shader`、`dasharray`、`points` | **前端解析 → 序列化** | ArrayBuffer（iOS `NSData` / Android `byte[]`） |
| canvas 级坐标变换 | `viewport`（逻辑像素 → 物理） | canvas 节点声明 + 渲染端 apply | `RenderTree` 顶层字段 |

注意：连 `strokeCap="round"` 这类枚举字符串也前置——前端框架组件接受友好字符串，parser 映射成 byte，底层 prop 收 number。原生连枚举解析都不剩，原则一致。

颜色 `0xAARRGGBB` 的「三态」是合理取舍，保持不变：前端 API 收 packed int（紧凑易传）→ schema 是 `RGBAColor` 结构表（可读、4 字节对齐、为渐变留口子）→ skity `Paint` 又回到 packed int。

## 4. Schema 现状与扩展

Schema 在 `packages/lynx-skity/schema/render_tree*.fbs`（namespace `skityrt`），由 `scripts/generate-fbs.mjs` 经 flatc 生成 C++（`shared/skity/generated/`）与 Java stub（`android/.../fbs-gen/`）；iOS 直接复用 C++ stub。

**现有结构：**
- `RGBAColor { r,g,b,a:uint32 }`、`GradientStop`、`Gradient`（linear+radial+stops，完整）、`ResolvedPaint { type: NONE/COLOR/GRADIENT; color; gradient }`
- `PathCommand { type; args:[float] }` + `PathCommandType`（MOVE_TO..CLOSE）
- `TransformOp { type; args:[float] }` + `TransformType`（MATRIX..SKEW_Y）
- `ComputedStyle`（fill/stroke/strokeWidth/linecap/linejoin/dasharray/dashoffset/miterlimit/fillRule/opacity/display/visibility/transform）
- `RenderNode`（tag_name/style/几何 float/children/path_commands/points/gradient_units/spread_method）
- `RenderTree { root:RenderNode }`

**本阶段扩展（第 1 步）：**
- 新增 `ViewBox { x,y,width,height }` + `PreserveAspectRatio`（`AspectRatioAlign` + `AspectRatioMeetOrSlice`，SVG `preserveAspectRatio` 语义）
- `RenderTree` 增加 `viewport:ViewBox`、`preserve_aspect:PreserveAspectRatio`、`density:float`
- `RenderNode` 几何字段语义注释从 "absolute pixels" 改为 **logical pixels（在 viewport 逻辑坐标系内）**

**后续扩展（待定）：**
- **Shader**：`ResolvedPaint.type` 加 `SHADER=3` + `Shader` table。**设计待确认**——取决于要支持哪种 shader（图片填充 / runtime shader / skity `SkShader`）。确认前不落字段，避免悬空枚举值。

## 5. 二进制序列化协议

前端 `@lynx-skity/parsers` 把字符串/对象解析后，编排成对齐 FlatBuffer 结构的紧凑 ArrayBuffer，经 Lynx 组件 prop 传给原生（iOS `NSData` / Android `byte[]`）。原生 setter 只做**机械 copy**进 FlatBuffer vector，无字符串、无正则。

示例布局（path commands，所有值小端）：

```
[u32 command_count]
  逐条: [u8 type][u8 arg_count][f32 × arg_count]   (每条 4 字节对齐)
```

原生 `@LynxProp(name="pathData") fun setPathData(bytes: ByteArray)` 读 buffer → `PathCommand::Pack` 加进 `path_commands` vector。Gradient/Transform 同理（type + 标量参数 + stops/args 数组）。

> 具体字节布局在第 2 步（parsers）实施时定稿；原则是固定格式、原生零语义解析。

## 6. Viewport 坐标系（SVG viewBox 语义）

前端写 `width={100}` 是**逻辑像素**，`skity-canvas` 声明逻辑坐标系（`viewport={[x,y,w,h]}` + `preserveAspectRatio`），渲染时统一映射到物理像素。

- 子元素坐标在 FlatBuffer 里**保持逻辑像素原值**，变换只在根 canvas apply 一次 → 前端 parsers 与二进制数据都基于逻辑像素，干净统一。
- **viewport transform 在渲染端 `SkityRenderer::Draw` apply**（绘制前对 skity Canvas 做 scale/translate），不在前端。因为物理尺寸 / density 要等布局后才确定，前端 render 时拿不到——这恰好绕开了「前端产整棵 tree bytes」会遇到的布局时机问题。
- 现有渲染端已在做 `density` scale，扩展到 `viewport` + `preserveAspectRatio` 即可。

## 7. 原生侧变化

- **删除** `SkityPropParser`（Android `.kt` / iOS `.m`）的语义解析。
- 复杂字段 setter 改收 `byte[]` / `NSData`，机械 copy 进 FlatBuffer。
- `SkityCanvasShadowNode.measure()` **保留**（算布局 + 收集标量 + 搬运 bytes）；渲染端 apply viewport transform。
- 颜色 packed int prop 不变。

## 8. 工作分解

依赖顺序，每步独立可 review：

1. **schema 扩展**（viewport）→ regenerate stub。向后兼容，暂不改消费端。**← 进行中**
2. **`@lynx-skity/parsers`**（纯 JS 共享层）：color→int、枚举→byte、path d→序列化、transform→序列化、gradient→序列化。顺带补全 path 的 H/V/S/T/A（原生现仅 M/L/C/Q/Z）。
3. **原生瘦身**：删 `SkityPropParser`；复杂字段 setter 收 `byte[]`/`NSData` 机械 copy；渲染端 apply viewport transform。
4. **`@lynx-skity/react`**：薄壳组件 `<Circle>` 内部 normalize 后渲染 `<skity-circle>`；复用 parsers；加默认值 / `forwardRef` / 动画接入。
5. **example** 改用 React 组件层 + viewport demo。
6. **`@lynx-skity/vue`**（后续）：同理包装，底层标签框架无关，天然成立。

**外加（待定）：** Shader schema 扩展（需先确认 shader 类型）。

## 9. 遗留清理

- `shared/elements/`（`x-lynx-skity` C++ `LynxNativeView`）：autolink 默认脚手架，与图形管线无关，后续清理。
- `polyline` / `polygon`：渲染端 `SkityRenderer.cc` 已按 tag_name 分派，但原生未注册标签、TS 无类型、`points` prop 当前无人用——接入时一并补齐。

## 10. 关键文件索引

- Schema：`packages/lynx-skity/schema/render_tree{,_common,_style}.fbs`
- 代码生成：`packages/lynx-skity/scripts/generate-fbs.mjs`（`pnpm --filter lynx-skity generate-fbs`）
- 前端标签类型：`packages/lynx-skity/src/elements.ts`（`declare module` 增强 `IntrinsicElements`）
- 前端用法：`packages/example/src/App.tsx`
- 原生注册：Android `android/.../graphics/SkityBehavior.kt` + `SkityInit.kt`；iOS `ios/Classes/Node/SkityCanvasShadowNode.mm` + `SkityNodeBase.m`
- prop setter：Android `android/.../graphics/node/SkityNodeBase.kt`；iOS `ios/Classes/Node/SkityNodeBase.m`
- 待删 parser：Android `android/.../SkityPropParser.kt`；iOS `ios/.../SkityPropParser.m`
- 序列化：Android `android/.../node/SkityCanvasShadowNode.kt`（measure/buildRenderNode/buildStyle/buildPaint）；iOS `ios/Classes/Node/SkityCanvasShadowNode.mm`
- 渲染端：`packages/lynx-skity/shared/skity/SkityRenderer.cc`（跨平台 C++，`Draw(tree,canvas,density)`）
- 后端：Android `android/src/main/cpp/skity/{gles,vulkan}_render_backend.cpp`；iOS `ios/Classes/Render/`
