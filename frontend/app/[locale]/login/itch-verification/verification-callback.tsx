"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { getApiBaseUrl } from "src/utils/api-url"

const ItchVerificationCallback = () => {
  const t = useTranslations()
  const started = useRef(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    const state = params.get("state")
    const accessToken = params.get("access_token")
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    )

    if (!state || !accessToken || params.has("error")) {
      setError(true)
      return
    }

    void fetch(`${getApiBaseUrl()}/verification/itch/complete`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, access_token: accessToken }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Verification failed")
        const result: { return_to: string } = await response.json()
        if (
          !result.return_to.startsWith("/") ||
          result.return_to.startsWith("//")
        ) {
          throw new Error("Invalid return path")
        }
        window.location.assign(result.return_to)
      })
      .catch(() => setError(true))
  }, [])

  return error ? (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-6">
      <p>{t("itch-verification-failed")}</p>
      <Button onClick={() => window.location.assign("/")}>
        {t("back-to-home")}
      </Button>
    </div>
  ) : (
    <div className="flex justify-center p-6">
      <p>{t("verifying")}</p>
    </div>
  )
}

export default ItchVerificationCallback
