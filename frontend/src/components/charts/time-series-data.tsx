"use client"

import { useLocale, useTranslations } from "next-intl"
import { getIntlLocale } from "src/localize"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function TimeSeriesData({
  data,
  title,
  valueLabel,
}: {
  data: readonly { date: string; value: number }[]
  title: string
  valueLabel: string
}) {
  const t = useTranslations()
  const locale = getIntlLocale(useLocale())
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    calendar: "gregory",
    timeZone: "UTC",
  })
  const numberFormat = new Intl.NumberFormat(locale)

  return (
    <details className="mt-4">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
        {t("view-chart-data")}
      </summary>
      <div
        className="mt-3 max-h-80 overflow-y-auto"
        // Keyboard users need to focus this region to scroll the data.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={title}
      >
        <Table>
          <TableCaption>{title}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("date")}</TableHead>
              <TableHead scope="col" className="text-end">
                {valueLabel}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(({ date, value }) => (
              <TableRow key={date}>
                <TableCell>
                  <time dateTime={date}>
                    {dateFormat.format(new Date(`${date}T00:00:00Z`))}
                  </time>
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {numberFormat.format(value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.length === 0 && <p>{t("chart-no-data")}</p>}
      </div>
    </details>
  )
}
