import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  getQualityAnalysisQualityModerationAppIdAnalysisGet,
  requestQualityAnalysisQualityModerationAppIdAnalysisPost,
} from "src/codegen/quality-moderation/quality-moderation"
import type { QualityAnalysisResponse } from "src/codegen/model"
import { getApiBaseUrl } from "src/utils/api-url"

const statusLabels = {
  not_requested: "No current analysis. Request a new run to see scores.",
  queued: "Queued for analysis.",
  running: "Analyzing the captured listing…",
  completed: "Analysis complete.",
  failed: "Analysis failed. You can request a new run.",
}

const criterionLabels: Record<string, string> = {
  "app-icon-footprint":
    "Icon doesn't fill too much or too little of the canvas",
  "app-icon-contrast": "Good icon contrast on dark backgrounds",
  "app-icon-detail": "Not too much or too little icon detail",
  "app-icon-no-baked-in-shadows": "No baked-in icon shadows",
  "app-icon-in-line-with-contemporary-styles":
    "Icon in line with contemporary styles",
  "app-name-just-the-name": "App name is just the name",
  "app-no-weird-formatting": "No weird app name formatting or punctuation",
  "app-summary-not-technical":
    "Summary understandable for a non-technical person",
  "app-summary-no-weird-formatting":
    "No weird summary formatting or punctuation",
  "app-summary-dont-repeat-app-name": "Summary doesn't repeat the app name",
  "app-summary-dont-start-with-an-article":
    "Summary doesn't start with an article",
  "branding-good-primary-brand-colors": "Good primary brand colors",
}

const scoreFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 3 })
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export function QualityAnalysisPanel({ appId }: { appId: string }) {
  const client = useQueryClient()
  const queryKey = ["qualityAnalysis", appId]
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      (
        await getQualityAnalysisQualityModerationAppIdAnalysisGet(appId, {
          withCredentials: true,
          signal,
        })
      ).data,
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.state)
        ? Math.min(2000 * 2 ** Math.min(query.state.dataUpdateCount, 4), 15000)
        : false,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await requestQualityAnalysisQualityModerationAppIdAnalysisPost(appId, {
          withCredentials: true,
        })
      ).data,
    onSuccess: (data) => client.setQueryData(queryKey, data),
  })

  if (query.data?.state === "disabled") {
    return null
  }
  if (!query.data) {
    return (
      <p role="status" className="p-4 text-sm">
        {query.isError
          ? "Could not load Appraise status. Reopen the panel to retry."
          : "Loading Appraise status…"}
      </p>
    )
  }
  return (
    <QualityAnalysisView
      appId={appId}
      analysis={query.data}
      requesting={mutation.isPending}
      error={query.isError || mutation.isError}
      onRun={() => mutation.mutate()}
    />
  )
}

export function QualityAnalysisView({
  appId,
  analysis,
  requesting = false,
  error = false,
  onRun,
}: {
  appId: string
  analysis: QualityAnalysisResponse
  requesting?: boolean
  error?: boolean
  onRun: () => void
}) {
  const active = analysis.state === "queued" || analysis.state === "running"
  const criteria = Object.entries(analysis.criteria ?? {})
  const partial =
    analysis.state === "completed" &&
    criteria.some(([, value]) => value.unavailable)
  if (analysis.state === "disabled") {
    return null
  }

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Appraise analysis</CardTitle>
        <CardDescription>
          Model scores are review assistance, not confidence that a guideline is
          satisfied. Your decisions remain manual. Analyses expire one hour
          after you request them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p role="status" aria-live="polite" aria-atomic="true">
          {partial
            ? "Analysis complete. Some criteria are unavailable."
            : statusLabels[analysis.state]}
          {analysis.stale
            ? " · Out of date: listing or model changed. Run again before using these scores."
            : ""}
        </p>
        {error ? (
          <p role="alert">
            Could not update analysis. Please try again shortly.
          </p>
        ) : null}
        {criteria.length > 0 ? (
          <dl className="flex flex-col gap-3">
            {criteria.map(([id, criterion]) => (
              <div
                key={id}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1"
              >
                <dt>{criterionLabels[id] ?? id}</dt>
                <dd className="text-end tabular-nums">
                  {criterion.unavailable
                    ? "Unavailable"
                    : `Model score: ${scoreFormat.format(criterion.pass_score)}`}
                </dd>
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {criterion.unavailable ??
                    (criterion.calibrated
                      ? "Calibrated model score"
                      : "Uncalibrated model score")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {analysis.snapshot ? (
          <details>
            <summary className="cursor-pointer">
              Inspect analyzed inputs and model
            </summary>
            <div className="flex flex-col gap-3 pt-3">
              <p>
                Analysis uses English/default-language metadata, regardless of
                your website language.
              </p>
              {analysis.has_icon && analysis.id ? (
                // Private snapshot endpoint must bypass the public Next image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${getApiBaseUrl()}/quality-moderation/${encodeURIComponent(appId)}/analysis/${encodeURIComponent(analysis.id)}/icon`}
                  alt="Icon captured for this analysis"
                  width={128}
                  height={128}
                  className="size-32 object-contain"
                />
              ) : null}
              <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(analysis.snapshot, null, 2)}
              </pre>
              {analysis.captured_at ? (
                <p>
                  Inputs captured:{" "}
                  {dateFormat.format(new Date(analysis.captured_at))} UTC
                </p>
              ) : null}
              {analysis.icon_verified_at ? (
                <p>
                  Icon checked:{" "}
                  {dateFormat.format(new Date(analysis.icon_verified_at))} UTC.
                  Icon bytes are checked only when you request a new run.
                </p>
              ) : null}
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(analysis.identity, null, 2)}
              </pre>
            </div>
          </details>
        ) : null}
        {analysis.result ? (
          <details>
            <summary className="cursor-pointer">Hints and measurements</summary>
            <p className="py-3">
              Hints are heuristics, not explanations of the classifier&apos;s
              scores.
            </p>
            <pre className="overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(
                {
                  hints: analysis.result.hints,
                  measurements: analysis.result.measurements,
                },
                null,
                2,
              )}
            </pre>
          </details>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          variant="secondary"
          disabled={active || requesting}
          onClick={onRun}
        >
          {active || requesting
            ? "Analysis in progress"
            : analysis.id
              ? "Run again with fresh inputs"
              : "Run Appraise"}
        </Button>
      </CardFooter>
    </Card>
  )
}
