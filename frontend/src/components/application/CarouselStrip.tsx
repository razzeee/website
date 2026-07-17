import { ChevronRightIcon, ChevronLeftIcon } from "@heroicons/react/24/solid"
import { mapScreenshot } from "../../types/Appstream"

import Lightbox from "yet-another-react-lightbox"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import Inline from "yet-another-react-lightbox/plugins/inline"
import "yet-another-react-lightbox/styles.css"
import Captions from "yet-another-react-lightbox/plugins/captions"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import CarouselNextJsImage from "./CarouselNextJsImage"
import { CarouselJsonLd } from "next-seo"
import { DesktopAppstream } from "src/codegen"
import { Imgproxy } from "../ImgproxyImage"

export const CarouselStrip = ({
  app,
}: {
  app: Pick<DesktopAppstream, "screenshots">
}) => {
  const t = useTranslations()
  const [showLightbox, setShowLightbox] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mobileEdgePadding, setMobileEdgePadding] = useState<{
    start: number
    end: number
  }>()
  const stripRef = useRef<HTMLUListElement>(null)
  const slideRefs = useRef<(HTMLLIElement | null)[]>([])
  const shouldCenterActiveSlideRef = useRef(true)
  const isCenteringScrollRef = useRef(false)
  const centeringScrollTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)

  useEffect(() => {
    setCurrentIndex(0)
  }, [])

  // Handle both array and dict formats for screenshots
  const screenshotsArray = Array.isArray(app.screenshots) ? app.screenshots : []

  const slides = screenshotsArray.map(mapScreenshot).map((screenshot) => {
    return {
      ...screenshot,
      title: screenshot.caption,
      alt: screenshot.caption || t("lightbox.screenshot"),
      caption: undefined,
    }
  })

  const activeIndex = slides.length > currentIndex ? currentIndex : 0
  const hasMultipleSlides = slides.length > 1

  useEffect(() => {
    if (!hasMultipleSlides) {
      return
    }

    if (!shouldCenterActiveSlideRef.current) {
      shouldCenterActiveSlideRef.current = true
      return
    }

    const strip = stripRef.current
    const activeSlide = slideRefs.current[activeIndex]

    if (!strip || !activeSlide) {
      return
    }

    const stripRect = strip.getBoundingClientRect()
    const activeSlideRect = activeSlide.getBoundingClientRect()

    isCenteringScrollRef.current = true

    if (centeringScrollTimeoutRef.current) {
      clearTimeout(centeringScrollTimeoutRef.current)
    }

    centeringScrollTimeoutRef.current = setTimeout(() => {
      isCenteringScrollRef.current = false
    }, 600)

    strip.scrollTo({
      left:
        strip.scrollLeft +
        activeSlideRect.left -
        stripRect.left -
        (strip.clientWidth - activeSlideRect.width) / 2,
      behavior: "smooth",
    })
  }, [activeIndex])

  useEffect(() => {
    return () => {
      if (centeringScrollTimeoutRef.current) {
        clearTimeout(centeringScrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasMultipleSlides) {
      return
    }

    const strip = stripRef.current

    if (!strip) {
      return
    }

    let animationFrame: number | undefined

    const updateActiveSlideFromScroll = () => {
      animationFrame = undefined

      if (isCenteringScrollRef.current) {
        return
      }

      const stripRect = strip.getBoundingClientRect()
      const stripCenter = stripRect.left + stripRect.width / 2
      let closestIndex = -1
      let closestDistance = Infinity

      slideRefs.current.forEach((slide, index) => {
        if (!slide) {
          return
        }

        const slideRect = slide.getBoundingClientRect()
        const slideCenter = slideRect.left + slideRect.width / 2
        const distance = Math.abs(slideCenter - stripCenter)

        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      if (closestIndex < 0) {
        return
      }

      setCurrentIndex((previousIndex) => {
        if (previousIndex === closestIndex) {
          return previousIndex
        }

        shouldCenterActiveSlideRef.current = false
        return closestIndex
      })
    }

    const onScroll = () => {
      if (animationFrame === undefined) {
        animationFrame = requestAnimationFrame(updateActiveSlideFromScroll)
      }
    }

    strip.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      strip.removeEventListener("scroll", onScroll)

      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [hasMultipleSlides, slides.length])

  useEffect(() => {
    if (!hasMultipleSlides) {
      setMobileEdgePadding(undefined)
      return
    }

    const strip = stripRef.current

    if (!strip) {
      return
    }

    const updateEdgePadding = () => {
      const firstSlide = slideRefs.current[0]
      const lastSlide = slideRefs.current[slides.length - 1]

      if (!firstSlide || !lastSlide || strip.clientWidth >= 640) {
        setMobileEdgePadding(undefined)
        return
      }

      const nextPadding = {
        start: Math.max((strip.clientWidth - firstSlide.offsetWidth) / 2, 24),
        end: Math.max((strip.clientWidth - lastSlide.offsetWidth) / 2, 24),
      }

      setMobileEdgePadding((currentPadding) => {
        if (
          currentPadding?.start === nextPadding.start &&
          currentPadding?.end === nextPadding.end
        ) {
          return currentPadding
        }

        return nextPadding
      })
    }

    updateEdgePadding()

    const resizeObserver = new ResizeObserver(updateEdgePadding)
    resizeObserver.observe(strip)
    slideRefs.current.forEach((slide) => {
      if (slide) {
        resizeObserver.observe(slide)
      }
    })

    return () => resizeObserver.disconnect()
  }, [hasMultipleSlides, slides.length])

  const goToSlide = (index: number) => {
    if (!hasMultipleSlides) {
      return
    }

    shouldCenterActiveSlideRef.current = true
    setCurrentIndex((index + slides.length) % slides.length)
  }

  const getSlideWidthClass = (slide: (typeof slides)[number]) => {
    const width = Number(slide.width)
    const height = Number(slide.height)
    const aspectRatio = width > 0 && height > 0 ? width / height : 16 / 9

    if (aspectRatio < 0.8) {
      return "w-[min(58vw,280px)]"
    }

    if (aspectRatio < 1.2) {
      return "w-[min(66vw,420px)]"
    }

    if (aspectRatio > 2) {
      return "w-[min(82vw,680px)]"
    }

    return "w-[min(76vw,560px)]"
  }

  return (
    <div className="col-start-1 col-end-4 min-w-0 overflow-hidden bg-flathub-gainsborow dark:bg-flathub-arsenic">
      {slides && (
        <>
          <CarouselJsonLd
            useAppDir={true}
            ofType="default"
            data={slides.map((slide) => {
              return { url: slide.src }
            })}
          />
          <Lightbox
            controller={{ closeOnBackdropClick: true }}
            open={showLightbox}
            close={() => setShowLightbox(false)}
            plugins={[Captions, Zoom]}
            slides={slides}
            index={activeIndex}
            on={{
              view: ({ index }) => {
                shouldCenterActiveSlideRef.current = true
                setCurrentIndex(index)
              },
            }}
            render={{
              buttonPrev: screenshotsArray.length <= 1 ? () => null : undefined,
              buttonNext: screenshotsArray.length <= 1 ? () => null : undefined,
              slide: CarouselNextJsImage,
            }}
            labels={{
              Previous: t("lightbox.previous"),
              Next: t("lightbox.next"),
              Close: t("lightbox.close"),
              "Zoom in": t("lightbox.zoom-in"),
              "Zoom out": t("lightbox.zoom-out"),
            }}
          />
        </>
      )}
      <div className="relative min-w-0">
        <div className="my-0 mx-auto min-w-0">
          {hasMultipleSlides ? (
            <div className="relative flex h-[220px] items-center overflow-hidden sm:h-[280px] lg:h-[360px] xl:h-[420px]">
              <div
                className="pointer-events-none absolute inset-y-0 start-0 z-10 w-14 bg-gradient-to-r from-flathub-gainsborow to-transparent sm:w-24 dark:from-flathub-arsenic"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-y-0 end-0 z-10 w-14 bg-gradient-to-l from-flathub-gainsborow to-transparent sm:w-24 dark:from-flathub-arsenic"
                aria-hidden="true"
              />
              <button
                className="absolute start-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center bg-transparent text-flathub-dark-gunmetal/80 transition hover:text-flathub-dark-gunmetal dark:text-flathub-gainsborow/80 dark:hover:text-flathub-gainsborow"
                onClick={() => goToSlide(activeIndex - 1)}
                aria-label={t("lightbox.previous")}
                title={t("lightbox.previous")}
              >
                <ChevronLeftIcon className="size-7" />
              </button>
              <ul
                ref={stripRef}
                className="flex h-full w-full min-w-0 flex-1 list-none items-center gap-6 overflow-x-auto scroll-smooth px-6 py-8 [scrollbar-width:none] sm:gap-8 sm:px-10 lg:gap-10 lg:px-20 [&::-webkit-scrollbar]:hidden"
                style={
                  mobileEdgePadding
                    ? {
                        paddingInlineStart: mobileEdgePadding.start,
                        paddingInlineEnd: mobileEdgePadding.end,
                      }
                    : undefined
                }
              >
                {slides.map((slide, index) => {
                  return (
                    <li
                      key={slide.src ?? index}
                      ref={(node) => {
                        slideRefs.current[index] = node
                      }}
                      className={clsx(
                        "h-full shrink-0",
                        getSlideWidthClass(slide),
                      )}
                    >
                      <button
                        type="button"
                        className="relative block size-full overflow-hidden rounded-xl bg-flathub-gainsborow transition hover:opacity-90 dark:bg-flathub-arsenic"
                        onClick={() => {
                          shouldCenterActiveSlideRef.current = true
                          setCurrentIndex(index)
                          setShowLightbox(true)
                        }}
                        aria-label={slide.title || t("lightbox.screenshot")}
                      >
                        <Imgproxy
                          pictureClassName="block size-full"
                          fill
                          alt={slide.alt ?? ""}
                          src={slide.src}
                          loading={index === 0 ? "eager" : "lazy"}
                          draggable={false}
                          sizes="(min-width: 1280px) 680px, (min-width: 1024px) 64vw, 82vw"
                          className="object-contain"
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button
                className="absolute end-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center bg-transparent text-flathub-dark-gunmetal/80 transition hover:text-flathub-dark-gunmetal dark:text-flathub-gainsborow/80 dark:hover:text-flathub-gainsborow"
                onClick={() => goToSlide(activeIndex + 1)}
                aria-label={t("lightbox.next")}
                title={t("lightbox.next")}
              >
                <ChevronRightIcon className="size-7" />
              </button>
            </div>
          ) : (
            <div className="aspect-video max-h-[500px] w-full">
              <Lightbox
                plugins={[Inline]}
                slides={slides}
                index={activeIndex}
                carousel={{
                  finite: true,
                }}
                styles={{
                  button: { filter: "none" },
                  container: {
                    backgroundColor: "transparent",
                    width: "100%",
                    maxHeight: "500px",
                  },
                }}
                on={{
                  click: () => setShowLightbox(true),
                }}
                render={{
                  buttonPrev: () => null,
                  buttonNext: () => null,
                  slide: CarouselNextJsImage,
                }}
                labels={{
                  Previous: t("lightbox.previous"),
                  Next: t("lightbox.next"),
                }}
              />
            </div>
          )}
        </div>
        {slides?.length > 0 && slides[activeIndex]?.title && (
          <div className="flex justify-center text-center pb-4 text-sm">
            {slides[activeIndex]?.title}
          </div>
        )}
        {slides?.length > 1 && (
          <div>
            <ul className="flex flex-wrap list-none justify-center gap-3 pb-8 px-16">
              {slides?.map((screenshot, index) => (
                <li key={index} value={index}>
                  <button
                    className={clsx(
                      "size-2.5 cursor-pointer rounded-full transition-all duration-200",
                      index === activeIndex
                        ? "bg-flathub-celestial-blue scale-110"
                        : "bg-flathub-dark-gunmetal/30 dark:bg-flathub-gainsborow/40 hover:bg-flathub-dark-gunmetal/60 dark:hover:bg-flathub-gainsborow/70",
                    )}
                    aria-label={
                      screenshot.caption ??
                      t("lightbox.screenshot") + " " + index
                    }
                    onClick={() => {
                      goToSlide(index)
                    }}
                  ></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
