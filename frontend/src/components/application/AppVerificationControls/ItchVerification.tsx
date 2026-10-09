import { FunctionComponent, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import InlineError from "src/components/InlineError"
import Spinner from "src/components/Spinner"
import { AvailableMethod } from "src/codegen/model"
import { getApiBaseUrl } from "src/utils/api-url"

interface Props {
  appId: string
  method: AvailableMethod
  isNewApp: boolean
}

const ItchVerification: FunctionComponent<Props> = ({
  appId,
  method,
  isNewApp,
}) => {
  const t = useTranslations()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const startVerification = async () => {
    if (pending) return
    setPending(true)
    setError("")

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/verification/${encodeURIComponent(appId)}/itch/start`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_app: isNewApp,
            return_to: window.location.pathname + window.location.search,
          }),
        },
      )

      if (!response.ok) {
        setError(t("error-code", { code: response.status }))
        setPending(false)
        return
      }

      const data: { redirect: string } = await response.json()
      window.location.assign(data.redirect)
    } catch {
      setError(t("network-error-try-again"))
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <p>
        {t("itch-verification-instruction", {
          username: method.login_name ?? "",
        })}
      </p>
      <Button
        size="lg"
        onClick={() => void startVerification()}
        disabled={pending}
      >
        {pending ? <Spinner size="s" /> : t("verify-with-itch")}
      </Button>
      <InlineError shown={!!error} error={error} />
    </div>
  )
}

export default ItchVerification
