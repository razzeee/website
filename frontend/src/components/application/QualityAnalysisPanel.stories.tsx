import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, within } from "storybook/test"
import { QualityAnalysisView } from "./QualityAnalysisPanel"
import type { QualityAnalysisResponse } from "src/codegen/model"

const completed: QualityAnalysisResponse = {
  id: "analysis-example",
  state: "completed",
  captured_at: "2026-11-06T12:00:00Z",
  icon_verified_at: "2026-11-06T12:00:00Z",
  identity: {
    appraise: "0.2.2",
    bundle: "sha256:example",
    encoder: "example-revision",
  },
  snapshot: { name: "Example", summary: "Organize your ideas", branding: [] },
  criteria: {
    "app-name-just-the-name": {
      method: "model",
      pass_score: 0.84,
      calibrated: true,
    },
    "app-summary-not-technical": {
      method: "model",
      pass_score: 0.62,
      calibrated: false,
    },
  },
  result: {
    hints: ["A heuristic hint"],
    measurements: { name: { length: 7 } },
  },
}

const meta = {
  title: "Components/Application/QualityAnalysisPanel",
  component: QualityAnalysisView,
  args: {
    appId: "org.example.App",
    analysis: { state: "not_requested" },
    onRun: fn(),
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof QualityAnalysisView>
export default meta
type Story = StoryObj<typeof meta>

export const NotRequested: Story = {}
export const Queued: Story = {
  args: { analysis: { state: "queued" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toBeDisabled()
  },
}
export const Running: Story = { args: { analysis: { state: "running" } } }
export const Completed: Story = { args: { analysis: completed } }
export const Partial: Story = {
  args: {
    analysis: {
      ...completed,
      criteria: {
        ...completed.criteria,
        "app-icon-contrast": { unavailable: "No icon in snapshot" },
      },
    },
  },
}
export const Stale: Story = {
  args: { analysis: { ...completed, stale: true } },
}
export const Failed: Story = {
  args: { analysis: { state: "failed", id: "failed-analysis" } },
}
export const RequestFailed: Story = { args: { error: true } }
export const Disabled: Story = {
  args: { analysis: { state: "disabled" } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button"),
    ).not.toBeInTheDocument()
  },
}
