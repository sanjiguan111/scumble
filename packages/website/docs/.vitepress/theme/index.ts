// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Extends the VitePress default theme: dark-only tokens (custom.css), the
// animated hero stage via the home-hero-image slot, and <HomeStats/> as a
// global component for the landing page.
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";

import HomeHeroStage from "./components/HomeHeroStage.vue";
import HomeStats from "./components/HomeStats.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(HomeHeroStage),
    }),
  enhanceApp: ({ app }) => {
    app.component("HomeStats", HomeStats);
  },
} satisfies Theme;
