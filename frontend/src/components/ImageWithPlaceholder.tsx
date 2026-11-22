"use client"

import {
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

type Props = Omit<ComponentPropsWithoutRef<"img">, "onLoad" | "onError"> & {
  preview: string | ReactElement
  pictureClassName?: string
  children?: ReactNode
}

export function ImageWithPlaceholder({
  children,
  pictureClassName,
  preview,
  className,
  width,
  height,
  loading,
  alt,
  ...props
}: Props) {
  const [pending, setPending] = useState(true)
  const hidePreview = () => setPending(false)

  return (
    <span className={cn("relative inline-grid", pictureClassName)}>
      {pending &&
        (typeof preview === "string" ? (
          <img
            src={preview}
            alt=""
            aria-hidden
            draggable={false}
            width={width}
            height={height}
            loading={loading}
            className={cn(
              "pointer-events-none col-start-1 row-start-1",
              className,
            )}
          />
        ) : (
          <span
            aria-hidden
            className="pointer-events-none col-start-1 row-start-1"
          >
            {preview}
          </span>
        ))}
      <picture className="contents">
        {children}
        <img
          {...props}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          className={cn("col-start-1 row-start-1", className)}
          ref={(image) => {
            if (image?.complete) {
              hidePreview()
            }
          }}
          onLoad={hidePreview}
          onError={hidePreview}
        />
      </picture>
    </span>
  )
}
