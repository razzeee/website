"use client"

import * as Sentry from "@sentry/nextjs"
import NextError from "next/error"
import { Fragment, useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
        <Fragment>
          <h3>You have encountered an error</h3>
          <p>{error.toString()}</p>
          <button
            onClick={() => {
              reset()
            }}
          >
            Click here to retry!
          </button>
        </Fragment>
      </body>
    </html>
  )
}
