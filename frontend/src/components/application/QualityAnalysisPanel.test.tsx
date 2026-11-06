import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import type { QualityAnalysisResponse } from "src/codegen/model"
import { QualityAnalysisView } from "./QualityAnalysisPanel"

function render(analysis: QualityAnalysisResponse) {
  return renderToStaticMarkup(
    <QualityAnalysisView
      appId="org.example.App"
      analysis={analysis}
      onRun={() => {}}
    />,
  )
}

test.each(["queued", "running"] as const)(
  "%s is announced and cannot enqueue twice",
  (state) => {
    const html = render({ state })
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('disabled=""')
    expect(html).toContain(
      state === "queued"
        ? "Queued for analysis."
        : "Analyzing the captured listing…",
    )
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
  expect(html).toContain("Analysis complete. Some criteria are unavailable.")
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
  expect(html).toContain("Run again with fresh inputs")
  expect(html).not.toContain("disabled=")
})

test("disabled feature has no action", () => {
  expect(render({ state: "disabled" })).toBe("")
})

test("failed analysis allows a new run", () => {
  const html = render({ state: "failed", id: "failed" })
  expect(html).toContain("Analysis failed. You can request a new run.")
  expect(html).not.toContain("disabled=")
})
