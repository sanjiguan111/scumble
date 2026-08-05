// NOTE: simplified for the Android example app stage (lynx-skity library not
// integrated yet). The LynxSkityModule / <x-lynx-skity /> usage will be restored
// once the library is integrated into this app.
import 'lynx-skity/elements';

import { LynxSkityModule } from 'lynx-skity';

export function App() {

  console.log(LynxSkityModule.clear);

  return (
    <view>
      <text>lynx-skity</text>
      <x-lynx-skity style={{ width: '100px', height: '100px', border: '1px solid red' }} />
      <text>Lynx Android example — dev server + hot-reload</text>
    </view>
  );
}
