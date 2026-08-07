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
        startSSEServer();
        api.onDevCompileDone(() => {
          notifyReload();
        });
      },
    },
  ],
});
