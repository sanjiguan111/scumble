import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pluginReactLynx } from "@lynx-js/react-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";

const SSE_PORT = 3001;
let sseClients: ServerResponse[] = [];

function startSSEServer() {
  createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/hot-reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("data: connected\n\n");
      sseClients.push(res);
      req.on("close", () => {
        sseClients = sseClients.filter((c) => c !== res);
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  }).listen(SSE_PORT, () => {
    console.log(`[hot-reload] SSE server listening on port ${SSE_PORT}`);
  });
}

function notifyReload() {
  for (const res of sseClients) res.write("data: reload\n\n");
}

export default defineConfig({
  server: { host: "localhost" },
  resolve: {
    alias: {
      // Single React identity across the bundle: nested web-react deps
      // (its-fine inside @scumble/victory-native) must land on the Lynx
      // runtime too — two React copies make victory's hooks throw and the
      // page renders an empty patch (white screen).
      react: "@lynx-js/react",
      // App code imports the UPSTREAM names verbatim (RN code runs
      // unmodified); the bundler redirects to the scumble adapter and its
      // Lynx shims.
      "victory-native": "@scumble/victory-native",
      "react-native": "@scumble/victory-native/shims/react-native",
      "react-native-reanimated": "@scumble/victory-native/shims/reanimated",
      "react-native-gesture-handler": "@scumble/victory-native/shims/gesture-handler",
    },
  },
  source: {
    entry: {
      main: "./src/index.tsx",
    },
  },
  plugins: [
    pluginReactLynx(),
    {
      name: "plugin-hot-reload-sse",
      setup(api: any) {
        // Dev-only: `rspeedy build` runs plugin setup too, and an
        // unconditional listen on :3001 collides with any running dev server.
        if (api.context.command !== "dev") return;
        startSSEServer();
        api.onDevCompileDone(() => {
          notifyReload();
        });
      },
    },
  ],
});
