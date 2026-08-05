import 'lynx-skity/elements';

import { LynxSkityModule } from 'lynx-skity';

export function App() {
  return (
    <view>
      <text>lynx-skity</text>
      <text bindtap={() => LynxSkityModule.setValue('key', 'value')}>
        NAPI native module
      </text>
      <x-lynx-skity />
    </view>
  );
}
