"use client"

import { Chart } from "@tanstack/charts/react/tooltip"
import type { ChartDefinition } from "@tanstack/charts/react"
import type { ComponentProps, ReactNode } from "react"

type TanstackChartProps = Omit<
  ComponentProps<typeof Chart>,
  "definition" | "ariaLabel"
> & {
  definition: ChartDefinition
  ariaLabel: string
}

export function TanstackChart({ className, ...props }: TanstackChartProps) {
  return <Chart {...props} className={`tanstack-chart ${className ?? ""}`} />
}

export function ChartLegendItems({
  items,
}: {
  items: readonly { label: string; color: string }[]
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-4 text-xs">
      {items.map(({ label, color }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>
  )
}

export function ChartDataTable({
  label,
  caption,
  columns,
  rows,
}: {
  label: string
  caption: string
  columns: readonly string[]
  rows: readonly { key: string; cells: readonly ReactNode[] }[]
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
        {label}
      </summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted text-start">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2 text-start">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, cells }) => (
              <tr key={key} className="border-t">
                {cells.map((cell, index) => (
                  <td key={index} className="px-3 py-2 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
