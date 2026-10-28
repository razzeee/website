"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Search, ArrowUpRight } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Link, useRouter } from "src/i18n/navigation"
import { useSearchDependenciesDependenciesGet } from "src/codegen/dependencies/dependencies"
import { safeSourceUrl } from "./manifest-utils"
import styles from "./dependencies.module.css"
import CollectedTime from "./collected-time"

export default function DependencySearch() {
  const t = useTranslations("dependency-index")
  const params = useSearchParams()
  const router = useRouter()
  const q = params.get("q") ?? ""
  const match = params.get("match") === "source" ? "source" : "module"
  const cursor = params.get("cursor") ?? undefined
  const result = useSearchDependenciesDependenciesGet({ q, match, cursor })
  const data = result.data?.data
  const next = data?.next_cursor

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("scope")}
        </p>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <Card className="col-span-full">
        <CardContent>
          <form
            key={`${match}:${q}`}
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const query = new URLSearchParams({
                q: String(form.get("q") ?? "").trim(),
                match,
              })
              router.push(`/dependencies?${query}`)
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dependency-query">
                  {t(match === "module" ? "module-label" : "source-label")}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="dependency-query"
                    name="q"
                    defaultValue={q}
                    maxLength={match === "module" ? 200 : 2048}
                    placeholder={match === "module" ? "openssl" : "https://…"}
                  />
                  <Button type="submit" className="h-auto">
                    <Search data-icon="inline-start" />
                    {t("search")}
                  </Button>
                </div>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <nav className={styles.modes} aria-label={t("match-mode")}>
        <Button
          asChild
          size="sm"
          variant={match === "module" ? "selected" : "ghost"}
        >
          <Link
            href="/dependencies?match=module"
            aria-current={match === "module" ? "page" : undefined}
          >
            {t("module-label")}
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={match === "source" ? "selected" : "ghost"}
        >
          <Link
            href="/dependencies?match=source"
            aria-current={match === "source" ? "page" : undefined}
          >
            {t("source-label")}
          </Link>
        </Button>
      </nav>

      <details className={styles.notice}>
        <summary>{t("declarations-only")}</summary>
        <p>{t("limitations")}</p>
      </details>

      {data ? (
        <Card
          className={styles.coverage}
          role="region"
          aria-label={t("coverage")}
        >
          <CardHeader>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {t("coverage")}
            </h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t("coverage-count", { count: data.coverage.total })}
            </p>
            <dl className={styles.metrics}>
              {(
                [
                  "complete",
                  "partial",
                  "pending",
                  "missing",
                  "error",
                  "stale",
                ] as const
              )
                .filter((status) => data.coverage[status] > 0)
                .map((status) => (
                  <div key={status}>
                    <dt className="text-sm text-muted-foreground">
                      {t(status)}
                    </dt>
                    <dd className="text-2xl font-semibold tabular-nums">
                      {data.coverage[status]}
                    </dd>
                  </div>
                ))}
            </dl>
            {data.coverage.stale > 0 ? (
              <p className={styles.coverageNote}>{t("stale-description")}</p>
            ) : null}
            {data.coverage.last_observed_at ? (
              <p className="text-xs text-muted-foreground">
                {t("observed")}:{" "}
                <CollectedTime value={data.coverage.last_observed_at} />
              </p>
            ) : (
              <p>{t("not-indexed")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section
        aria-live="polite"
        aria-busy={result.isFetching}
        className={styles.results}
      >
        {result.isPending ? <p>{t("loading")}</p> : null}
        {result.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("load-error")}</AlertTitle>
            <AlertDescription>
              <Button variant="outline" onClick={() => result.refetch()}>
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {data && q ? (
          <h2 className={styles.resultsTitle}>{t("results", { query: q })}</h2>
        ) : null}
        {data && q && data.matches.length === 0 ? (
          <p>{t("no-results")}</p>
        ) : null}
        {data?.matches.map((item) => (
          <Card key={item.id} role="article" className="min-w-0 gap-4">
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/apps/${item.app_id}`} className={styles.appLink}>
                  {item.app_id}
                </Link>
                <div className="flex gap-2">
                  <Badge variant="outline">{item.kind}</Badge>
                  {item.stale || item.status === "partial" ? (
                    <Badge variant="secondary">
                      {t(
                        item.stale
                          ? "stale"
                          : item.status === "partial"
                            ? "partial"
                            : "complete",
                      )}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <p className={styles.moduleName}>{item.module_path}</p>
              {item.source_url ? (
                <p className="break-all text-sm">
                  {safeSourceUrl(item.source_url) ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {item.source_url}
                    </a>
                  ) : (
                    item.source_url
                  )}
                </p>
              ) : null}
              {Object.keys(item.evidence).length ? (
                <dl className={styles.evidence}>
                  {Object.entries(item.evidence).map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="break-all font-mono">
                        {typeof value === "string"
                          ? value
                          : JSON.stringify(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-2 border-t text-xs text-muted-foreground">
              <span>
                {t("collected")}: <CollectedTime value={item.collected_at} />
              </span>
              <Button asChild variant="link" size="sm">
                <Link
                  href={`/dependencies/manifests/${item.snapshot_id}?pointer=${encodeURIComponent(item.pointer)}`}
                >
                  {t("view-manifest")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
        {cursor ? (
          <Link
            href={`/dependencies?${new URLSearchParams({ q, match })}`}
            className="text-sm underline"
          >
            {t("first-page")}
          </Link>
        ) : null}
        {next ? (
          <Button asChild variant="outline">
            <Link
              href={`/dependencies?${new URLSearchParams({ q, match, cursor: next })}`}
            >
              {t("next-page")}
            </Link>
          </Button>
        ) : null}
      </section>
    </main>
  )
}
