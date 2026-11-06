import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { expect, test } from "vitest"
import messages from "../../../public/locales/en/common.json"
import type { QualityAnalysisResponse } from "src/codegen/model"
import { QualityAnalysisView } from "./QualityAnalysisPanel"

function render(analysis: QualityAnalysisResponse) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QualityAnalysisView
        appId="org.example.App"
        analysis={analysis}
        onRun={() => {}}
      />
    </NextIntlClientProvider>,
  )
}

test.each(["queued", "running"] as const)(
  "%s is announced and cannot enqueue twice",
  (state) => {
    const html = render({ state })
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('disabled=""')
    expect(html).toContain(messages["quality-analysis"][state])
  },
)

test("partial analysis distinguishes zero scores from unavailable criteria", () => {
  const html = render({
    state: "completed",
    criteria: {
      "app-icon-contrast": { unavailable: "No icon in snapshot" },
      "app-name-just-the-name": {
        method: "model",
        pass_score: 0,
        calibrated: false,
      },
    },
  })
  expect(html).toContain("Model score: 0")
  expect(html).toContain("No icon in snapshot")
  expect(html).toContain("Uncalibrated model score")
  expect(html).toContain(messages["quality-analysis"].partial)
  expect(html).not.toContain("disabled=")
})

test("stale results remain inspectable and offer a fresh run", () => {
  const html = render({
    state: "completed",
    id: "old",
    stale: true,
    snapshot: { name: "Old name", summary: "Old summary" },
    identity: { appraise: "0.2.2" },
  })
  expect(html).toContain("Out of date")
  expect(html).toContain("Old name")
  expect(html).toContain("0.2.2")
  expect(html).toContain(messages["quality-analysis"].rerun)
  expect(html).not.toContain("disabled=")
})

test("disabled feature has no action", () => {
  expect(render({ state: "disabled" })).toBe("")
})

test("failed analysis allows a new run", () => {
  const html = render({ state: "failed", id: "failed" })
  expect(html).toContain(messages["quality-analysis"].failed)
  expect(html).not.toContain("disabled=")
})
