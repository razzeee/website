import {
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import clsx from "clsx"
import { findBiggestScreenshotSize } from "src/types/Appstream"

import LogoImage from "../LogoImage"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { chooseBrandingColor, getContrastColor } from "@/lib/helpers"
import { Carousel } from "@/components/ui/carousel"
import Autoplay from "embla-carousel-autoplay"
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures"
import { getLangDir } from "rtl-detect"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "src/i18n/navigation"
import { DesktopAppstream } from "src/codegen"
import { Imgproxy } from "../ImgproxyImage"
import { Button } from "@/components/ui/button"
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid"

export const HeroBanner = ({
  heroBannerData,
  currentIndex,
  autoplay = true,
  aboveTheFold = false,
  forceTheme = undefined,
}: {
  heroBannerData: {
    app: { isFullscreen: boolean }
    appstream: Pick<
      DesktopAppstream,
      "id" | "name" | "branding" | "icon" | "summary" | "screenshots"
    >
  }[]
  currentIndex?: number
  autoplay?: boolean
  aboveTheFold?: boolean
  forceTheme?: "light" | "dark"
}) => {
  const locale = useLocale()
  const t = useTranslations()

  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()

  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const pointerPause = useRef<boolean | null>(null)
  const followSlideFocus = useRef(false)
  const hasSlides = heroBannerData.length > 1
  const canAutoplay = autoplay && hasSlides && !reducedMotion && !forceTheme
  const rotating = canAutoplay && !paused && !hovered

  useEffect(() => {
    setMounted(true)
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener("change", update)
    return () => preference.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!api) {
      return
    }

    const onSelect = () => {
      followSlideFocus.current = api
        .containerNode()
        .contains(document.activeElement)
      setCurrent(api.selectedScrollSnap())
    }
    onSelect()
    api.on("select", onSelect)
    api.on("reInit", onSelect)

    return () => {
      api.off("select", onSelect)
      api.off("reInit", onSelect)
    }
  }, [api])

  useLayoutEffect(() => {
    if (followSlideFocus.current) {
      api
        ?.slideNodes()
        [current]?.querySelector("a")
        ?.focus({ preventScroll: true })
      followSlideFocus.current = false
    }
  }, [api, current])

  useEffect(() => {
    if (
      api &&
      currentIndex !== undefined &&
      Number.isInteger(currentIndex) &&
      currentIndex >= 0 &&
      currentIndex < heroBannerData.length
    ) {
      api.scrollTo(currentIndex, reducedMotion)
    }
  }, [api, currentIndex, heroBannerData.length, reducedMotion])

  const direction = getLangDir(locale) ?? "ltr"

  return (
    <Carousel
      dir={direction}
      aria-label={t("featured-apps")}
      onFocusCapture={() => setPaused(true)}
      onPointerDownCapture={(event) => {
        if (!(event.target as HTMLElement).closest("[data-rotation-control]")) {
          setPaused(true)
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      opts={{
        loop: true,
        direction,
      }}
      plugins={[
        WheelGesturesPlugin(),
        Autoplay({
          delay: 5000,
          active: rotating,
        }),
      ]}
      className="overflow-hidden shadow-md rounded-xl"
      setApi={setApi}
    >
      {canAutoplay && (
        <Button
          type="button"
          data-rotation-control
          variant="secondary"
          size="icon"
          className="absolute end-4 bottom-4 z-10 size-11 rounded-full"
          aria-label={t(paused ? "resume-slideshow" : "pause-slideshow")}
          onPointerDown={() => {
            // Focus pauses too; preserve the action requested before focus moved.
            pointerPause.current = !paused
          }}
          onPointerCancel={() => {
            pointerPause.current = null
          }}
          onClick={(event) => {
            setPaused(
              event.detail > 0 ? (pointerPause.current ?? !paused) : !paused,
            )
            pointerPause.current = null
          }}
        >
          {paused ? (
            <PlayIcon className="size-5" aria-hidden="true" />
          ) : (
            <PauseIcon className="size-5" aria-hidden="true" />
          )}
        </Button>
      )}
      <CarouselContent
        className="h-[288px] xl:h-[352px] ms-0"
        aria-live={rotating ? "off" : "polite"}
      >
        {heroBannerData.map((data, i) => {
          const fallbackColor = chooseBrandingColor(
            data.appstream?.branding,
            "dark",
          )

          const brandingColor = chooseBrandingColor(
            data.appstream?.branding,
            forceTheme ?? (resolvedTheme as "light" | "dark"),
          )

          const textColor = mounted
            ? brandingColor && getContrastColor(brandingColor.value) === "black"
              ? "text-flathub-dark-gunmetal"
              : "text-flathub-lotion"
            : "text-flathub-dark-gunmetal dark:text-flathub-lotion"

          return (
            <CarouselItem
              className="basis-full ps-0"
              key={data.appstream.id}
              aria-label={t("slide-position", {
                current: i + 1,
                total: heroBannerData.length,
              })}
              inert={i !== current}
            >
              <Link
                href={`/apps/${data.appstream.id}`}
                passHref
                style={{
                  backgroundColor:
                    (mounted
                      ? brandingColor && brandingColor.value
                      : fallbackColor && fallbackColor.value) ?? "#FF00DC",
                }}
                className={clsx(
                  "flex min-w-0 items-center gap-4 p-4 py-0 duration-500 motion-reduce:duration-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-current",
                  "hover:cursor-grab",
                  "h-full",
                )}
              >
                <div className="flex justify-center flex-row w-full h-full gap-6 px-16">
                  <div className="flex flex-col justify-center items-center lg:w-1/3 h-auto w-full">
                    <div className="relative flex shrink-0 flex-wrap items-center justify-center drop-shadow-md lg:h-[128px] lg:w-[128px]">
                      <LogoImage
                        priority={aboveTheFold && i === 0}
                        iconUrl={data.appstream.icon}
                        appName={data.appstream.name}
                        loading="eager"
                        quality={100}
                        size={128}
                        fetchPriority={
                          aboveTheFold && i === 0 ? "high" : "auto"
                        }
                      />
                    </div>
                    <div className="flex pt-3">
                      <span
                        className={clsx(
                          "truncate whitespace-nowrap text-2xl font-black",
                          textColor,
                        )}
                      >
                        {data.appstream.name}
                      </span>
                    </div>
                    <div
                      className={clsx(
                        "line-clamp-2 text-sm text-center",
                        textColor,
                        "lg:line-clamp-3",
                      )}
                    >
                      {data.appstream.summary}
                    </div>
                  </div>
                  {data.appstream.screenshots?.[0] && (
                    <Imgproxy
                      pictureClassName="hidden w-2/3 xl:flex justify-center items-center overflow-hidden relative h-auto"
                      {...findBiggestScreenshotSize(
                        data.appstream.screenshots[0],
                      )}
                      alt={data.appstream.name}
                      loading="eager"
                      className={clsx(
                        "absolute rounded-lg",
                        data.app.isFullscreen ? "top-20" : "top-10 ",
                      )}
                      fetchPriority={aboveTheFold && i === 0 ? "high" : "auto"}
                    />
                  )}
                </div>
              </Link>
            </CarouselItem>
          )
        })}
      </CarouselContent>
      <CarouselPrevious
        className={clsx(
          "text-flathub-black dark:text-flathub-white",
          "hover:text-flathub-black dark:hover:text-flathub-white",
          "hover:bg-flathub-black/10 dark:hover:bg-flathub-white/10",
          "absolute start-4 top-1/2 size-11",
          (forceTheme || !hasSlides) && "hidden",
        )}
        variant="ghost"
      />
      <CarouselNext
        className={clsx(
          "text-flathub-black dark:text-flathub-white",
          "hover:text-flathub-black dark:hover:text-flathub-white",
          "hover:bg-flathub-black/10 dark:hover:bg-flathub-white/10",
          "absolute end-4 top-1/2 size-11",
          (forceTheme || !hasSlides) && "hidden",
        )}
        variant="ghost"
      />
    </Carousel>
  )
}
