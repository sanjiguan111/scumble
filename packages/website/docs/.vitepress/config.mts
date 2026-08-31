// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// VitePress config for the scumble docs site.
// Deployed to GitHub Pages at https://sanjiguan111.github.io/scumble — hence
// base: "/scumble/" and cleanUrls left off (static serving is safest).
import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "en-US",
  title: "scumble",
  description:
    "Declarative GPU drawing for Lynx with a react-native-skia-style component API, powered by the skity GPU backend (Android OpenGL ES / Vulkan, iOS Metal). Native animation engine with zero JS per frame.",
  base: "/scumble/",
  // Relative to docs/ → packages/website/dist, matching turbo's dist/** outputs.
  outDir: "../dist",
  lastUpdated: true,
  // Dark-only brand, no toggle. "force-dark" (not `false`) so the <html>
  // always carries the .dark class — otherwise shiki falls back to the light
  // token colors, which are unreadable on our dark code-block background.
  appearance: "force-dark",
  head: [
    ["link", { rel: "icon", href: "/scumble/favicon.svg" }],
    ["meta", { property: "og:title", content: "scumble — declarative GPU drawing for Lynx" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Declarative GPU drawing for Lynx with a react-native-skia-style component API, on the skity GPU backend. Native animation engine with zero JS per frame.",
      },
    ],
    [
      "meta",
      {
        property: "og:image",
        // OG crawlers need an absolute URL — relative paths are not resolved.
        content: "https://sanjiguan111.github.io/scumble/og-image.png",
      },
    ],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  sitemap: { hostname: "https://sanjiguan111.github.io/scumble/" },
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "API", link: "/api/", activeMatch: "/api/" },
      {
        text: "Architecture",
        link: "/architecture/overview",
        activeMatch: "/architecture/",
      },
      { text: "Examples", link: "/examples/" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Getting Started",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Installation", link: "/guide/installation" },
            { text: "Getting Started", link: "/guide/getting-started" },
          ],
        },
        {
          text: "Guides",
          items: [
            { text: "Canvas & viewPort", link: "/guide/canvas" },
            { text: "Shapes", link: "/guide/shapes" },
            { text: "Painting", link: "/guide/painting" },
            { text: "Gradients", link: "/guide/gradients" },
            { text: "Images", link: "/guide/images" },
            { text: "Text", link: "/guide/text" },
            {
              text: "Transforms & clipping",
              link: "/guide/transforms-and-clipping",
            },
            { text: "Filters", link: "/guide/filters" },
            { text: "Animation", link: "/guide/animation" },
            { text: "Playback control", link: "/guide/playback-control" },
            { text: "Path2D", link: "/guide/path2d" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "Canvas & Group", link: "/api/canvas-and-group" },
            { text: "Shapes", link: "/api/shapes" },
            { text: "Paint", link: "/api/paint" },
            { text: "Gradients", link: "/api/gradients" },
            { text: "Filters", link: "/api/filters" },
            { text: "Clipping", link: "/api/clipping" },
            { text: "Images", link: "/api/images" },
            { text: "Paragraph & Text", link: "/api/paragraph-and-text" },
            { text: "Animation", link: "/api/animation" },
            { text: "Path2D", link: "/api/path2d" },
          ],
        },
      ],
      "/architecture/": [
        {
          text: "Architecture",
          items: [
            { text: "Overview", link: "/architecture/overview" },
            { text: "Render pipeline", link: "/architecture/render-pipeline" },
            {
              text: "Animation engine",
              link: "/architecture/animation-engine",
            },
            { text: "Text layout", link: "/architecture/text-layout" },
            {
              text: "Native integration",
              link: "/architecture/native-integration",
            },
          ],
        },
      ],
    },
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/sanjiguan111/scumble" },
    ],
    footer: {
      message: "Released under the Apache License 2.0.",
      copyright: "Copyright © scumble contributors",
    },
    outline: "deep",
    docFooter: { prev: "Prev", next: "Next" },
  },
});
