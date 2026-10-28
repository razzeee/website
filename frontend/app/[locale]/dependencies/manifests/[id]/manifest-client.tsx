"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Link } from "src/i18n/navigation"
import { useGetDependencySnapshotDependenciesSnapshotsSnapshotIdGet } from "src/codegen/dependencies/dependencies"
import { declarationAtPointer } from "../../manifest-utils"
import { ArrowLeft, FileJson } from "lucide-react"
import styles from "../../dependencies.module.css"
import CollectedTime from "../../collected-time"

export default function ManifestView({ id }: { id: number }) {
  const t = useTranslations("dependency-index")
  const pointer = useSearchParams().get("pointer") ?? ""
  const result = useGetDependencySnapshotDependenciesSnapshotsSnapshotIdGet(id)
  const data = result.data?.data
  const selected = data
    ? declarationAtPointer(data.manifest, pointer)
    : undefined
  return (
    <main className={styles.manifestPage}>
      <Button asChild variant="link" className="self-start px-0">
        <Link href="/dependencies">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("title")}
        </Link>
      </Button>
      <header className={styles.manifestHeader}>
        <h1 className={styles.title}>{t("manifest-title")}</h1>
        <p>{t("manifest-description")}</p>
      </header>
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
      {data ? (
        <>
          <Card>
            <CardContent>
              <dl className={styles.metadata}>
                {[
                  [t("repository"), data.repository],
                  [t("ref"), data.ref],
                  [t("commit"), data.commit],
                  [t("manifest-path"), data.manifest_path],
                  [t("digest"), data.digest],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-all font-mono">{value}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-muted-foreground">{t("collected")}</dt>
                  <dd>
                    <CollectedTime value={data.created_at} />
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          {data.diagnostics.length ? (
            <Alert>
              <AlertTitle>{t("partial")}</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {data.diagnostics.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {pointer ? (
            <Card role="region" aria-label={t("selected-declaration")}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b">
                <h2 className="flex items-center gap-2 font-semibold">
                  <FileJson size={16} aria-hidden="true" />
                  {t("selected-declaration")}
                </h2>
                <code className="break-all text-sm">{pointer}</code>
              </CardHeader>
              <CardContent>
                {selected === undefined ? (
                  <p>{t("invalid-pointer")}</p>
                ) : (
                  <pre
                    className="whitespace-pre-wrap break-all text-sm leading-relaxed"
                    role="region"
                    aria-label={t("selected-declaration")}
                  >
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent>
              <details open={!pointer}>
                <summary className="cursor-pointer font-semibold">
                  {t("full-manifest")}
                </summary>
                <pre
                  className="mt-4 whitespace-pre-wrap break-all text-xs"
                  role="region"
                  aria-label={t("full-manifest")}
                >
                  {JSON.stringify(data.manifest, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  )
}
