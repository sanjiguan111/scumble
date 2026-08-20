// <Paragraph>: rich text laid out natively (CoreText on iOS). Layout runs in
// the TASM measure pass; the measured height reaches JS asynchronously via
// onLayout (a Lynx "layout" component event).

import { useState } from "@lynx-js/react";

import { ColorMatrix, LinearGradient, Paragraph, TextSpan } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

export function ParagraphDemo() {
  const [info, setInfo] = useState("");

  return (
    <view>
      <DemoSection title="单 span 基础" caption="系统字体,宽度约束自动换行" height={130}>
        <Paragraph
          x={10}
          y={10}
          width={330}
          fontSize={16}
          onLayout={(d) => setInfo(`height=${d.height.toFixed(1)} lines=${d.lineCount}`)}
        >
          <TextSpan text="The quick brown fox jumps over the lazy dog. 敏捷的棕色狐狸跳过了懒惰的狗。" />
        </Paragraph>
      </DemoSection>

      <DemoSection title="多 span 富文本" caption="同段不同字号/颜色/粗斜体,基线对齐" height={110}>
        <Paragraph x={10} y={10} width={330} fontSize={16}>
          <TextSpan text="Hello " />
          <TextSpan text="skity" color="#3b82f6" fontWeight={700} fontSize={24} />
          <TextSpan text=" — " color="#9ca3af" />
          {/* 文本也可以走 children(首尾空白会被 trim,注意别吃掉段内空格) */}
          <TextSpan italic={true} color="#ef4444">
            italic span
          </TextSpan>
          <TextSpan text=" and back to normal weight text." />
        </Paragraph>
      </DemoSection>

      <DemoSection
        title="对齐与行高"
        caption="左:lineHeight 1.6 / 中:center / 右:right"
        height={150}
      >
        <Paragraph x={10} y={10} width={100} fontSize={13} lineHeight={1.6}>
          <TextSpan text="行高 1.6 倍的多行文本效果" />
        </Paragraph>
        <Paragraph x={120} y={10} width={110} fontSize={13} textAlign="center">
          <TextSpan text="居中对齐的多行文本" />
        </Paragraph>
        <Paragraph x={240} y={10} width={100} fontSize={13} textAlign="right">
          <TextSpan text="右对齐的多行文本" />
        </Paragraph>
      </DemoSection>

      <DemoSection title="shaping 排版" caption="连字 · 字距 · emoji 组合字形" height={150}>
        <Paragraph x={10} y={10} width={330} fontSize={16}>
          <TextSpan text="Office workflow: fine figure affine. " />
          <TextSpan text="AVATAR To Ya" fontWeight={700} />
          {/* 国旗 = 两个 Regional Indicator 经 GSUB 组合成单字形；基础
              emoji（😀🎉❤️）用于验证 fallback 通路。 */}
          <TextSpan text=" 🇨🇳" />
          <TextSpan text=" 😀🎉" />
          <TextSpan text=" ❤️" />
        </Paragraph>
      </DemoSection>

      <DemoSection title="渐变与滤镜" caption="渐变 fill 整段;ColorMatrix 滤色" height={130}>
        {/* 渐变子元素走 fill 槽,span 颜色只剩 alpha 参与调制 */}
        <Paragraph x={10} y={10} width={330} fontSize={22} fontWeight={700}>
          <LinearGradient
            start={[10, 0]}
            end={[340, 0]}
            colors={["#8b5cf6", "#ec4899", "#f59e0b"]}
          />
          <TextSpan>Gradient text</TextSpan>
        </Paragraph>
        {/* ColorMatrix(饱和度置 0)对整段文字做滤色 */}
        <Paragraph x={10} y={70} width={330} fontSize={15} color="#3b82f6">
          <ColorMatrix
            matrix={[
              0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0,
              0, 0, 0, 0, 1, 0,
            ]}
          />
          <TextSpan>color-filtered (grayscale) span text</TextSpan>
        </Paragraph>
      </DemoSection>

      <DemoSection title="maxLines 截断" caption="3 行截断 + 省略号" height={90}>
        <Paragraph x={10} y={10} width={330} fontSize={14} maxLines={3}>
          <TextSpan text="这是一段很长的文本用来验证 maxLines 截断与省略号行为。 Lynx-skity renders text through skity's glyph pipeline with CoreText laying out the paragraph on iOS. 这段文本超过三行时应该被截断并显示省略号。" />
        </Paragraph>
      </DemoSection>

      <DemoSection title="onLayout 测量回传" caption="异步事件携带 height/lineCount" height={70}>
        <Paragraph x={10} y={10} width={330} fontSize={14}>
          <TextSpan text="首段文字的测量结果会显示在下方。" />
        </Paragraph>
      </DemoSection>
      {/* Lynx <text> 是非 virtual 元素（有真实 UI），不能放进 skity-canvas
          （SkityCanvasUI 不是 UIGroup，Android 直接报错）——结果文本放 canvas 外。 */}
      <text
        style={{ fontSize: "12px", color: "#6b7280", paddingLeft: "16px", marginBottom: "24px" }}
      >
        首段: {info}
      </text>
    </view>
  );
}
