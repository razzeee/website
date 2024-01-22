import { GetStaticProps } from "next"
import { useTranslation } from "next-i18next"
import { serverSideTranslations } from "next-i18next/serverSideTranslations"
import { NextSeo } from "next-seo"
import LoginGuard from "../src/components/login/LoginGuard"
import UserApps from "../src/components/user/UserApps"
import { IS_PRODUCTION } from "src/env"
import VendingLink from "src/components/user/VendingLink"
import { useUserContext } from "src/context/user-info"
import { useRouter } from "next/router"
import ButtonLink from "src/components/ButtonLink"
import CodeCopy from "src/components/application/CodeCopy"
import { HiMiniPlus } from "react-icons/hi2"
import Breadcrumbs from "src/components/Breadcrumbs"

export default function Userpage() {
  const { t } = useTranslation()
  const user = useUserContext()
  const router = useRouter()

  if (!router.isReady || user.loading) {
    return null
  }

  // Nothing to show if not logged in
  if (!user.info && !user.loading) {
    router.push("/login", undefined, { locale: router.locale })
    return null
  }

  const pages = [{ name: t("my-flathub"), current: true, href: "/my-flathub" }]

  const inviteCode = user.info.invite_code.replace(/(.{3})(?!$)/g, "$1-")

  return (
    <>
      <NextSeo title={t("my-flathub")} noindex={true} />
      <div className="max-w-11/12 mx-auto my-0 w-11/12 2xl:w-[1400px] 2xl:max-w-[1400px]">
        <LoginGuard>
          <div className="space-y-12">
            <Breadcrumbs pages={pages} />
            <div className="mt-4 p-4 flex flex-wrap gap-3 rounded-xl bg-flathub-white shadow-md dark:bg-flathub-arsenic">
              <>
                <div className="space-y-12">
                  <h1 className="text-4xl font-extrabold">{t("my-flathub")}</h1>
                  {!IS_PRODUCTION && <UserApps variant="owned" />}
                  <UserApps
                    variant="dev"
                    customButtons={
                      (!IS_PRODUCTION || user.info?.is_moderator) && (
                        <ButtonLink
                          className="w-full sm:w-auto"
                          passHref
                          href="/apps/new"
                        >
                          <HiMiniPlus className="w-5 h-5" />
                          {t("new-app")}
                        </ButtonLink>
                      )
                    }
                  />

                  {(!IS_PRODUCTION || user.info?.is_moderator) && (
                    <>
                      <div>
                        <UserApps variant="invited" />
                        <div className="flex items-baseline gap-1">
                          {t("invite-code")}
                          <CodeCopy className="w-48" text={inviteCode} nested />
                        </div>
                        <div className="text-sm text-flathub-sonic-silver dark:text-flathub-spanish-gray">
                          {t("invite-code-hint")}
                        </div>
                      </div>
                    </>
                  )}

                  {!IS_PRODUCTION && user.info.dev_flatpaks.length && (
                    <div className="my-auto">
                      <h3 className="my-4 text-xl font-semibold">
                        {t("accepting-payment")}
                      </h3>
                      <VendingLink />
                    </div>
                  )}
                </div>
              </>
            </div>
          </div>
        </LoginGuard>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
    revalidate: 900,
  }
}
