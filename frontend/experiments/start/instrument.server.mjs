import * as Sentry from "@sentry/tanstackstart-react"

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://b512f563700847e787e978ae1c15133c@o467221.ingest.sentry.io/6610580",
  tracesSampleRate: 0.03,
  debug: false,
})
