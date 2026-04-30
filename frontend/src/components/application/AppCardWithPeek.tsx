"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { AnimatePresence, motion } from "framer-motion"
import { ApplicationCard } from "./ApplicationCard"
import type { AppstreamListItem } from "../../types/Appstream"
import { findBiggestScreenshotSize } from "../../types/Appstream"
import type { DesktopAppstream } from "../../codegen"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Link } from "../../i18n/navigation"
import { Images } from "lucide-react"

const API_BASE_URI =
  process.env.NEXT_PUBLIC_API_BASE_URI || "https://flathub.org/api/v2"

interface AppCardWithPeekProps {
  application: AppstreamListItem
  className?: string
  priority?: boolean
}

type PeekState = "idle" | "loading" | "loaded" | "error"

const overlayVariants = {
  hidden: { opacity: 0, y: 4, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.18, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.98,
    transition: { duration: 0.12, ease: "easeIn" },
  },
}

export function AppCardWithPeek({
  application,
  className,
  priority = false,
}: AppCardWithPeekProps) {
  const t = useTranslations()
  const [peekState, setPeekState] = useState<PeekState>("idle")
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [activeShot, setActiveShot] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const cacheRef = useRef<string[] | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchScreenshots = useCallback(async () => {
    if (cacheRef.current !== null) {
      setScreenshots(cacheRef.current)
      setPeekState(cacheRef.current.length > 0 ? "loaded" : "error")
      return
    }

    setPeekState("loading")
    try {
      const res = await fetch(`${API_BASE_URI}/appstream/${application.id}`)
      if (!res.ok) throw new Error("fetch failed")
      const data: DesktopAppstream = await res.json()
      const shots = (data.screenshots ?? [])
        .slice(0, 3)
        .map((s) => {
          const sized = findBiggestScreenshotSize(s)
          return sized.src ?? null
        })
        .filter((src): src is string => !!src)

      cacheRef.current = shots
      setScreenshots(shots)
      setActiveShot(0)
      setPeekState(shots.length > 0 ? "loaded" : "error")
    } catch {
      cacheRef.current = []
      setPeekState("error")
    }
  }, [application.id])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    // Small delay so fast mouse-overs don't trigger fetches
    hoverTimerRef.current = setTimeout(() => {
      fetchScreenshots()
    }, 120)
  }, [fetchScreenshots])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setPeekState((s) => (s === "loading" ? "idle" : s))
  }, [])

  const showOverlay = isHovered && peekState !== "idle" && peekState !== "error"

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      <ApplicationCard application={application} priority={priority} />

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-flathub-gainsborow/60 bg-flathub-white shadow-xl dark:border-flathub-arsenic dark:bg-flathub-dark-gunmetal"
            role="region"
            aria-label={t("app-screenshots")}
          >
            {peekState === "loading" && (
              <Skeleton className="h-36 w-full rounded-none" />
            )}

            {peekState === "loaded" && screenshots.length > 0 && (
              <div className="flex flex-col">
                {/* Screenshot display */}
                <Link
                  href={`/apps/${application.id}`}
                  tabIndex={-1}
                  className="block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshots[activeShot]}
                    alt={`${application.name} screenshot ${activeShot + 1}`}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                  />
                </Link>

                {/* Thumbnail strip (only if multiple screenshots) */}
                {screenshots.length > 1 && (
                  <div className="flex gap-1 p-2">
                    {screenshots.map((src, idx) => (
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={idx}
                        role="button"
                        tabIndex={0}
                        aria-label={`Screenshot ${idx + 1}`}
                        className={cn(
                          "h-10 flex-1 cursor-pointer overflow-hidden rounded transition-all duration-150",
                          activeShot === idx
                            ? "ring-2 ring-flathub-celestial-blue"
                            : "opacity-60 hover:opacity-100",
                        )}
                        onMouseEnter={() => setActiveShot(idx)}
                        onFocus={() => setActiveShot(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setActiveShot(idx)
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Indicator dot: shows if screenshots exist (after first hover) */}
      {peekState === "loaded" && screenshots.length > 0 && !isHovered && (
        <div
          className="pointer-events-none absolute inset-e-2 top-2 flex items-center gap-0.5 rounded-full bg-flathub-dark-gunmetal/60 px-1.5 py-0.5"
          aria-hidden="true"
        >
          <Images className="size-2.5 text-white" />
          <span className="text-[9px] font-medium text-white">
            {screenshots.length}
          </span>
        </div>
      )}
    </div>
  )
}
