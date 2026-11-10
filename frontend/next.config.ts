import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants"
import { withSentryConfig } from "@sentry/nextjs/config"
import createNextIntlPlugin from "next-intl/plugin"
import { NextConfig } from "next"
import { headers, redirects } from "./http-policy.mjs"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")
const buildId = process.env.GITHUB_SHA

const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "flathub",
  project: "frontend",

  // The Docker build does not inherit GitHub Actions' CI environment variable.
  silent: false,

  release: buildId
    ? {
        name: buildId,
        // Supported by the Sentry build plugin, but missing from @sentry/nextjs' type.
        setCommits: false as never,
        finalize: false,
      }
    : undefined,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: false,
}

if (!buildId) {
  console.info(
    "No GITHUB_SHA environment variable found. Using the default Next.js buildId.",
  )
}

const nextConfig: (phase: string) => NextConfig = (phase) => ({
  output: "standalone",
  assetPrefix:
    phase === PHASE_DEVELOPMENT_SERVER
      ? undefined
      : "https://dl.flathub.org/assets",
  experimental: {
    scrollRestoration: true,
    globalNotFound: true,
  },
  serverExternalPackages: ["@takumi-rs/core"],
  cacheHandler:
    process.env.NODE_ENV === "production"
      ? require.resolve("./cache-handler.mjs")
      : undefined,
  cacheMaxMemorySize: process.env.NODE_ENV === "production" ? 0 : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flathub.org",
      },
      {
        protocol: "https",
        hostname: "dl.flathub.org",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "gitlab.com",
      },
      {
        protocol: "https",
        hostname: "gitlab.gnome.org",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "secure.gravatar.com",
      },
      {
        protocol: "https",
        hostname: "invent.kde.org",
      },
    ],
    localPatterns: [
      {
        pathname: "/api/badge",
      },
    ],
  },
  redirects: async () => redirects(),
  headers: async () =>
    headers({
      production: phase === PHASE_PRODUCTION_BUILD,
      siteBaseUri: process.env.NEXT_PUBLIC_SITE_BASE_URI,
    }),
  generateBuildId: buildId
    ? async () => {
        return buildId
      }
    : undefined,
})

module.exports = async (phase) => {
  const config =
    process.env.ENABLE_SENTRY === "true"
      ? withSentryConfig(
          withNextIntl(nextConfig(phase)),
          sentryWebpackPluginOptions,
        )
      : withNextIntl(nextConfig(phase))

  return config
}
