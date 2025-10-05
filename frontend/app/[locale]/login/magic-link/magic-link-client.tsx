"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useUserDispatch } from "../../../../src/context/user-info"
import { useLocalStorage } from "../../../../src/hooks/useLocalStorage"
import { usePendingTransaction } from "../../../../src/hooks/usePendingTransaction"
import { isInternalRedirect } from "../../../../src/utils/security"
import { LOGIN_PROVIDERS_URL } from "../../../../src/env"
import { getUserData } from "../../../../src/asyncs/login"
import type { JSX } from "react"
import { useRouter } from "src/i18n/navigation"
import MagicLinkForm from "../../../../src/components/login/MagicLinkForm"
import Spinner from "../../../../src/components/Spinner"
import { robustFetch } from "../../../../src/utils/fetch"

const MagicLinkClient = (): JSX.Element => {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const dispatch = useUserDispatch()

  const [pendingTransaction] = usePendingTransaction()
  const [returnTo, setReturnTo] = useLocalStorage<string | null>(
    "returnTo",
    null,
  )

  const [verifying, setVerifying] = useState(false)
  const token = searchParams.get("token")

  useEffect(() => {
    // If there's a token in the URL, verify it
    if (token && !verifying) {
      setVerifying(true)

      const verifyToken = async () => {
        try {
          const res = await robustFetch(
            `${LOGIN_PROVIDERS_URL}/magic-link/verify`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ token }),
            },
          )

          if (res.ok) {
            // Fetch user data
            await getUserData(dispatch)

            // Redirect appropriately
            if (pendingTransaction) {
              router.push("/purchase")
            } else if (returnTo) {
              const redirect = decodeURIComponent(returnTo)
              setReturnTo(null)

              if (isInternalRedirect(redirect)) {
                router.push(redirect)
                return
              }
            }

            router.push("/")
          } else {
            const data = await res.json()
            toast.error(t(data.detail) || t("magic-link-invalid"))
            // Remove token from URL
            router.replace("/login/magic-link")
          }
        } catch {
          toast.error(t("network-error-try-again"))
          router.replace("/login/magic-link")
        } finally {
          setVerifying(false)
        }
      }

      verifyToken()
    }
  }, [
    token,
    verifying,
    dispatch,
    pendingTransaction,
    returnTo,
    setReturnTo,
    router,
    t,
  ])

  // Show spinner while verifying
  if (token && verifying) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Spinner size="l" />
        <p className="text-flathub-dark-gunmetal dark:text-flathub-gainsborow">
          {t("verifying-magic-link")}
        </p>
      </div>
    )
  }

  // Show the form if no token or after failed verification
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full flex-col gap-5 p-5 sm:w-[400px]">
        <MagicLinkForm />
      </div>
    </div>
  )
}

export default MagicLinkClient
