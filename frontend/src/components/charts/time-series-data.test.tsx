import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import { TimeSeriesData } from "./time-series-data"
import messages from "../../../public/locales/en/common.json"

function render(data: { date: string; value: number }[], locale = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TimeSeriesData
        data={data}
        title="Daily downloads"
        valueLabel="Downloads"
      />
    </NextIntlClientProvider>,
  )
}

describe("time-series text alternative", () => {
  it("exposes dates and exact counts, including zero, in a labelled table", () => {
    const html = render([
      { date: "2026-01-01", value: 0 },
      { date: "2026-01-02", value: 12345 },
    ])
    expect(html).toContain("View chart data")
    expect(html).toContain("Daily downloads</caption>")
    expect(html).toContain('scope="col"')
    expect(html).toContain('dateTime="2026-01-01">January 1, 2026</time>')
    expect(html).toContain(">0</td>")
    expect(html).toContain(">12,345</td>")
  })

  it("formats values and dates for the current locale", () => {
    const html = render([{ date: "2026-01-02", value: 12345 }], "de")
    expect(html).toContain("2. Januar 2026")
    expect(html).toContain(">12.345</td>")
  })

  it("explains when the chart has no data", () => {
    expect(render([])).toContain("No data available.")
  })
})
