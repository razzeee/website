import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import sharp from "sharp"

const root = resolve("../..")
const adapter = (file) => resolve(`src/adapters/${file}`)

export default defineConfig({
  publicDir: resolve(root, "public"),
  build: { assetsDir: "build-assets" },
  define: Object.fromEntries(
    Object.entries({
      NEXT_PUBLIC_API_BASE_URI: "http://127.0.0.1:4101",
      NEXT_PUBLIC_SITE_BASE_URI:
        process.env.NEXT_PUBLIC_SITE_BASE_URI || "http://127.0.0.1:3001",
      NEXT_PUBLIC_IS_PRODUCTION: "false",
      NEXT_PUBLIC_SENTRY_DSN:
        process.env.NEXT_PUBLIC_SENTRY_DSN ||
        "https://b512f563700847e787e978ae1c15133c@o467221.ingest.sentry.io/6610580",
      NEXT_PUBLIC_MATOMO_WEBSITE_ID: "12",
      NEXT_PUBLIC_SITEMAP_SIZE: "3000",
      NEXT_PUBLIC_MEILISEARCH_URL: "https://flathub.org/api/search",
      NEXT_PUBLIC_MEILISEARCH_KEY:
        "8e64a12d4888fa52821f9c0e2da65e29fa6f7a4601c2ca7768614a40839c6e3f",
    }).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(process.env[key] ?? value),
    ]),
  ),
  resolve: {
    dedupe: ["react", "react-dom", "use-intl", "@tanstack/react-router"],
    alias: [
      {
        find: /^tailwindcss$/,
        replacement: resolve(root, "node_modules/tailwindcss/index.css"),
      },
      { find: "next-intl/server", replacement: adapter("intl-server.js") },
      { find: /^next-intl$/, replacement: adapter("intl.jsx") },
      { find: "src/i18n/navigation", replacement: adapter("navigation.jsx") },
      { find: "next/navigation", replacement: adapter("navigation.jsx") },
      { find: "next/headers", replacement: adapter("headers.server.js") },
      { find: "next/image", replacement: adapter("image.jsx") },
      { find: "next/server", replacement: adapter("next-server.js") },
      { find: "@sentry/nextjs", replacement: adapter("sentry.js") },
      { find: "nuqs/adapters/next/app", replacement: "nuqs/adapters/react" },
      { find: "src", replacement: resolve(root, "src") },
      { find: "app", replacement: resolve(root, "app") },
      { find: "@", replacement: resolve(root, "@") },
      { find: "public", replacement: resolve(root, "public") },
    ],
  },
  css: { postcss: resolve(root) },
  plugins: [
    {
      name: "prototype-next-boundaries",
      enforce: "pre",
      resolveId(id, importer, options) {
        if (id === "isomorphic-dompurify" && options?.ssr) {
          return adapter("dompurify.server.js")
        }
      },
      async load(id) {
        if (
          id.startsWith(resolve(root, "public")) &&
          /\.(png|jpe?g|webp|svg)$/.test(id)
        ) {
          const { width, height } = await sharp(await readFile(id)).metadata()
          return `export default ${JSON.stringify({ src: id.slice(resolve(root, "public").length), width, height })}`
        }
      },
      transform(code, id) {
        if (id.endsWith("/instrumentation-client.ts")) {
          return code
            .replace(
              "export const onRouterTransitionStart = Sentry.captureRouterTransitionStart",
              "",
            )
            .replace("process.env.SENTRY_DSN", "undefined")
        }
        if (id.endsWith("/app/client-providers.tsx")) {
          return code
            .replace("useEffect, useMemo", "useEffect, useMemo, useState")
            .replace("const queryClient = new QueryClient()", "")
            .replace(
              "const track =",
              "const [queryClient] = useState(() => new QueryClient())\n  const track =",
            )
        }
        // Resolve both absolute and relative imports of the same i18n boundary.
        if (id === resolve(root, "src/i18n/navigation.ts")) {
          return `export * from ${JSON.stringify(adapter("navigation.jsx"))}`
        }
      },
    },
    tanstackStart({ client: { entry: "./client.jsx" } }),
    nitro({
      traceDeps: ["isomorphic-dompurify", "redis"],
      publicAssets: [{ dir: resolve(root, "public"), baseURL: "/" }],
      routeRules: {
        "/build-assets/**": {
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        },
      },
    }),
    react(),
  ],
})
