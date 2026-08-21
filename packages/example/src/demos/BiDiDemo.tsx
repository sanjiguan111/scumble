// <Paragraph direction>: UAX #9 bidirectional text. Android resolves levels
// with SheenBidi + HarfBuzz visual-order shaping; iOS rides CoreText's
// built-in UAX #9. textAlign stays physical — left/right are screen edges.

import { Paragraph, TextSpan } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// 阿语「双向文本:阿拉伯语与拉丁语、数字混排,方向由段落基方向决定」
const AR_MIXED =
  "نص ثنائي الاتجاه: العربية واللاتينية 123 والأرقام مختلطة مع English words داخل الجملة.";
// 希伯来语「你好世界,这是一段从右向左的文本」
const HE_MIXED = "שלום עולם, זהו טקסט מימין לשמאל עם 456 numbers ו-English.";

export function BiDiDemo() {
  return (
    <view>
      <DemoSection title="RTL 段落" caption="direction=rtl:整段右起,数字/英文保持 LTR" height={120}>
        <Paragraph x={10} y={10} width={330} fontSize={16} direction="rtl">
          <TextSpan text={AR_MIXED} />
        </Paragraph>
      </DemoSection>

      <DemoSection title="auto 首强字符检测" caption="阿语/希伯来语开头自动按 RTL 处理" height={120}>
        <Paragraph x={10} y={10} width={330} fontSize={16} direction="auto">
          <TextSpan text={HE_MIXED} />
        </Paragraph>
      </DemoSection>

      <DemoSection title="LTR 中的 RTL 片段" caption="不设 direction:嵌段原地内部反转,位置不动" height={70}>
        <Paragraph x={10} y={10} width={330} fontSize={15}>
          <TextSpan text="Hello " />
          <TextSpan text="مرحبا" color="#3b82f6" fontWeight={700} />
          <TextSpan text=" World " />
          <TextSpan text="שלום" color="#ef4444" />
          <TextSpan text=" mixed bidi." />
        </Paragraph>
      </DemoSection>

      <DemoSection
        title="direction × textAlign"
        caption="对齐保持物理方向:rtl 段下 left/center/right 仍指屏幕边"
        height={130}
      >
        <Paragraph x={10} y={10} width={100} fontSize={13} direction="rtl" textAlign="left">
          <TextSpan text="محاذاة لليسار" />
        </Paragraph>
        <Paragraph x={120} y={10} width={110} fontSize={13} direction="rtl" textAlign="center">
          <TextSpan text="محاذاة وسط" />
        </Paragraph>
        <Paragraph x={240} y={10} width={100} fontSize={13} direction="rtl" textAlign="right">
          <TextSpan text="محاذاة يمين" />
        </Paragraph>
      </DemoSection>

      <DemoSection title="RTL 截断" caption="maxLines 截断:省略号落在逻辑尾部一侧" height={90}>
        <Paragraph x={10} y={10} width={330} fontSize={14} direction="rtl" maxLines={2}>
          <TextSpan
            text={`${AR_MIXED} ${HE_MIXED} نص إضافي طويل جدا للتأكد من أن القص يعمل بشكل صحيح مع الاتجاه من اليمين إلى اليسار.`}
          />
        </Paragraph>
      </DemoSection>
    </view>
  );
}
