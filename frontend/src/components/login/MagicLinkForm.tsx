"use client"

import { useTranslations } from "next-intl"
import { FormEvent, FunctionComponent, useState } from "react"
import { toast } from "sonner"
import { LOGIN_PROVIDERS_URL } from "../../env"
import { robustFetch } from "../../utils/fetch"
import { MailIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const MagicLinkForm: FunctionComponent = () => {
  const t = useTranslations()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!email || !email.includes("@")) {
      toast.error(t("invalid-email-address"))
      return
    }

    setLoading(true)

    try {
      const res = await robustFetch(`${LOGIN_PROVIDERS_URL}/magic-link`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSubmitted(true)
        toast.success(t("magic-link-sent"))
      } else {
        const data = await res.json()
        toast.error(data.error || t("network-error-try-again"))
      }
    } catch {
      toast.error(t("network-error-try-again"))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-flathub-white p-8 shadow-md dark:bg-flathub-arsenic">
        <MailIcon className="h-16 w-16 text-flathub-celestial-blue" />
        <h2 className="text-xl font-bold">{t("check-your-email")}</h2>
        <p className="text-center text-flathub-dark-gunmetal dark:text-flathub-gainsborow">
          {t("magic-link-sent-description")}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setSubmitted(false)
            setEmail("")
          }}
        >
          {t("send-another")}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-xl bg-flathub-white p-8 shadow-md dark:bg-flathub-arsenic sm:w-[400px]"
    >
      <h2 className="text-xl font-bold">{t("login-with-magic-link")}</h2>
      <p className="text-sm text-flathub-dark-gunmetal dark:text-flathub-gainsborow">
        {t("magic-link-description")}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          {t("email-address")}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("email-placeholder")}
          className="rounded-lg border border-flathub-sonic-silver bg-flathub-white px-4 py-3 text-flathub-dark-gunmetal focus:border-flathub-celestial-blue focus:outline-none dark:border-flathub-spanish-gray dark:bg-flathub-arsenic dark:text-flathub-gainsborow"
          required
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? t("sending") : t("send-magic-link")}
      </Button>
    </form>
  )
}

export default MagicLinkForm
