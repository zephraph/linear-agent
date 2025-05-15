import { defineConfig } from "vite";
import devServer from "@hono/vite-dev-server";

export default defineConfig({
  optimizeDeps: {
    entries: ["./src/client/*.ts"],
  },
  server: {
    https: {
      key: "./certs/linear.agent-key.pem",
      cert: "./certs/linear.agent.pem",
    },
    host: "linear.agent",
    port: 3000,
  },
  plugins: [devServer({
    entry: "./src/index.tsx",
    injectClientScript: true,
  })],
});