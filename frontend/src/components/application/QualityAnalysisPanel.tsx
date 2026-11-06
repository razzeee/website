import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useFormatter, useTranslations } from "next-intl"
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

export function QualityAnalysisPanel({ appId }: { appId: string }) {
  const t = useTranslations("quality-analysis")
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
        {t(query.isError ? "load-error" : "loading")}
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
  const t = useTranslations("quality-analysis")
  const guideline = useTranslations("quality-guideline")
  const format = useFormatter()
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
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p role="status" aria-live="polite" aria-atomic="true">
          {t(partial ? "partial" : analysis.state)}
          {analysis.stale ? ` · ${t("stale")}` : ""}
        </p>
        {error ? <p role="alert">{t("request-error")}</p> : null}
        {criteria.length > 0 ? (
          <dl className="flex flex-col gap-3">
            {criteria.map(([id, criterion]) => (
              <div
                key={id}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1"
              >
                <dt>{guideline(id)}</dt>
                <dd className="text-end tabular-nums">
                  {criterion.unavailable
                    ? t("unavailable")
                    : t("score", {
                        score: format.number(criterion.pass_score, {
                          maximumFractionDigits: 3,
                        }),
                      })}
                </dd>
                <dd className="col-span-2 text-xs text-muted-foreground">
                  {criterion.unavailable ??
                    t(criterion.calibrated ? "calibrated" : "uncalibrated")}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {analysis.snapshot ? (
          <details>
            <summary className="cursor-pointer">{t("snapshot")}</summary>
            <div className="flex flex-col gap-3 pt-3">
              <p>{t("default-language")}</p>
              {analysis.has_icon && analysis.id ? (
                // Private snapshot endpoint must bypass the public Next image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${getApiBaseUrl()}/quality-moderation/${encodeURIComponent(appId)}/analysis/${encodeURIComponent(analysis.id)}/icon`}
                  alt={t("icon")}
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
                  {t("captured", {
                    time: format.dateTime(new Date(analysis.captured_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              ) : null}
              {analysis.icon_verified_at ? (
                <p>
                  {t("icon-verified", {
                    time: format.dateTime(new Date(analysis.icon_verified_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
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
            <summary className="cursor-pointer">{t("diagnostics")}</summary>
            <p className="py-3">{t("hints-note")}</p>
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
          {t(active || requesting ? "working" : analysis.id ? "rerun" : "run")}
        </Button>
      </CardFooter>
    </Card>
  )
}
