package com.example.lynxskity;

import android.content.Context;
import android.widget.TextView;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.LynxElement;
import com.lynx.tasm.behavior.ui.LynxUI;

@LynxElement(name = "x-lynx-skity")
public class LynxSkityElement extends LynxUI<TextView> {
  public LynxSkityElement(LynxContext context) {
    super(context);
  }

  @Override
  protected TextView createView(Context context) {
    TextView view = new TextView(context);
    view.setText("x-lynx-skity");
    return view;
  }
}
