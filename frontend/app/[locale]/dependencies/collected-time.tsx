"use client"

import { useFormatter } from "next-intl"

export default function CollectedTime({ value }: { value: string }) {
  const format = useFormatter()
  // Backend timestamps are UTC, without an explicit offset.
  const date = new Date(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`,
  )
  return (
    <time dateTime={date.toISOString()} title={value}>
      {format.dateTime(date, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })}{" "}
      UTC
    </time>
  )
}
