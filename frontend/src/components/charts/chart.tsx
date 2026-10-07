"use client"

import { Chart } from "@tanstack/charts/react/tooltip"
import type { ChartDefinition } from "@tanstack/charts/react"
import { useState, type ComponentProps, type ReactNode } from "react"
import Modal from "src/components/Modal"
import { Button } from "@/components/ui/button"

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
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => setIsOpen(true)}
        >
          {label}
        </Button>
      </div>
      <Modal
        shown={isOpen}
        title={caption}
        onClose={() => setIsOpen(false)}
        size="xl"
        className="max-h-[90vh] overflow-y-auto"
      >
        <div className="max-h-[65vh] overflow-auto rounded-md border">
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
      </Modal>
    </>
  )
}
