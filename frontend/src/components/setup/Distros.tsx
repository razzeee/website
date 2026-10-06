import { useTranslations } from "next-intl"
import { HowToJsonLd } from "next-seo"
import CodeCopy from "src/components/application/CodeCopy"
import type { ReactNode } from "react"
import Image from "next/image"
import { Link } from "src/i18n/navigation"
import { motion } from "framer-motion"
import type { DistroSetup, SetupText } from "src/distro-setup"

function richTextValues(block: SetupText) {
  const values: Record<string, (chunks: ReactNode) => ReactNode> = {
    text: (chunks) =>
      block.textTag === "h2" ? <h2>{chunks}</h2> : <p>{chunks}</p>,
    header: (chunks) => <h2>{chunks}</h2>,
    strong: (chunks) => <strong>{chunks}</strong>,
    em: (chunks) => <em>{chunks}</em>,
    link: (chunks) => <Link href="/">{chunks}</Link>,
    applink: (chunks) => <Link href="/">{chunks}</Link>,
    filelink: (chunks) => (
      <a href="https://dl.flathub.org/repo/flathub.flatpakrepo">{chunks}</a>
    ),
  }
  for (const [tag, command] of Object.entries(block.commands ?? {})) {
    values[tag] = () => <CodeCopy text={command} />
  }
  for (const [tag, link] of Object.entries(block.links ?? {})) {
    values[tag] = (chunks) => <a href={link.href}>{link.text ?? chunks}</a>
  }
  return values
}

export function DistroInstructions({ distro }: { distro: DistroSetup }) {
  const t = useTranslations()
  const key = `distros.${distro.translationKey}`
  const layoutId = distro.name.replaceAll("/", "").replaceAll(" ", "-")
  const url = `https://flathub.org/setup/${encodeURIComponent(distro.slug ?? distro.name)}`

  return (
    <>
      <div className="flex flex-col items-center">
        <motion.picture layoutId={`distro-logo-${layoutId}`}>
          {distro.logo_dark && (
            <source
              srcSet={distro.logo_dark}
              media="(prefers-color-scheme: dark)"
            />
          )}
          <Image
            width={128}
            height={128}
            src={distro.logo}
            alt={t("app-logo", { app_name: t(distro.translatedNameKey) })}
          />
        </motion.picture>
        <motion.h1 layoutId={`distro-name-${layoutId}`}>
          {t(distro.translatedNameKey)}
        </motion.h1>
      </div>
      {distro.steps.length > 0 && (
        <HowToJsonLd
          useAppDir
          name={t(distro.translatedNameKey)}
          image={distro.logo}
          estimatedCost={{ currency: "USD", value: "0" }}
          step={distro.steps.map((block) => ({
            url,
            name: t(`${key}.${block.translationKey}.name`),
            itemListElement: [
              {
                type: "HowToDirection",
                text: t
                  .raw(`${key}.${block.translationKey}.text`)
                  .replace(/<[^>]*>/g, "")
                  .replace(/\s{2,}/g, " ")
                  .trim(),
              },
            ],
          }))}
        />
      )}
      {distro.introduction &&
        t.rich(
          `${key}.${distro.introduction.translationKey}`,
          richTextValues(distro.introduction),
        )}
      {distro.steps.length > 0 && (
        <ol className="distrotut">
          {distro.steps.map((block) => (
            <li key={block.translationKey}>
              <h2>{t(`${key}.${block.translationKey}.name`)}</h2>
              {t.rich(
                `${key}.${block.translationKey}.text`,
                richTextValues(block),
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
