export const documentationFeed = {
  version: "https://jsonfeed.org/version/1",
  title: "Sandbox developer news",
  home_page_url: "https://docs.flathub.org/blog/",
  description: "Synthetic documentation feed for browser regression tests",
  items: [
    {
      id: "https://docs.flathub.org/blog/sandbox-update",
      title: "Sandbox developer update",
      summary: "Frozen developer portal rendering fixture.",
      date_modified: "2026-01-01T00:00:00Z",
    },
  ],
}

export const permissionReview = {
  assessment_id: 123,
  app_id: "org.example.Sandbox",
  created_at: "2026-01-01T00:00:00Z",
  outcome: "pending",
  acceptance_basis: null,
  candidate_kind: "pull-request",
  forge_instance: "github.com",
  source_repository: "example/sandbox",
  pull_request_number: null,
  pull_request_url: null,
  target_git_branch: "master",
  destination_channel: "stable",
  flatpak_branch: "stable",
  difference_count: 0,
  superseded_by: null,
  review_url: "https://example.test/review/123",
  pipeline_id: "sandbox",
  build_id: 123,
  built_revision: "sandbox",
  pull_request_head_revision: null,
  base_revision: "sandbox",
  expected_arches: ["x86_64"],
  snapshot_fingerprint: "sandbox-fingerprint",
  comparison_fingerprint: null,
  comparison_source: null,
  candidate_artifacts: [],
  comparison_artifacts: [],
  candidate_snapshot: null,
  comparison_snapshot: null,
  differences: [],
  build_checks: [],
  error_code: null,
  error_message: null,
  linked_assessment_id: null,
  decision_id: null,
  decisions: [],
}

export const paymentTransaction = {
  summary: {
    id: "123",
    value: 500,
    currency: "usd",
    kind: "purchase",
    status: "pending",
  },
  details: [],
}

export const managedApp = {
  id: "org.example.Sandbox",
  name: "Sandbox Managed App",
  summary: "Synthetic app-management fixture",
  type: "desktop",
  icon: "",
  bundle: { flatpak: "app/org.example.Sandbox/x86_64/stable" },
  metadata: {},
}

export const vendingConfig = {
  status: "ok",
  platforms: { "org.example.Platform": { keep: 100, depends: null } },
  fee_fixed_cost: 0,
  fee_cost_percent: 0,
  fee_prefer_percent: 0,
}

export const purchaseApp = {
  ...managedApp,
  id: "org.example.PurchaseSandbox",
  name: "Sandbox Purchase App",
  bundle: { runtime: "org.example.Platform/x86_64/1" },
}
export const donationApp = {
  ...purchaseApp,
  id: "org.example.DonationSandbox",
  name: "Sandbox Donation App",
}

export function publishedYear(now = new Date()) {
  return now.getUTCMonth() === 11 && now.getUTCDate() >= 15
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1
}

export function yearReview(year) {
  return {
    year,
    total_downloads: 12345,
    new_apps_count: 123,
    total_apps: 2345,
    updates_count: 3456,
    total_downloads_change: 1000,
    total_downloads_change_percentage: 8,
    top_apps: [],
    top_games: [],
    top_emulators: [],
    top_game_stores: [],
    top_game_utilities: [],
    popular_apps_by_category: [],
    biggest_growth_by_category: [],
    newcomers_by_category: [],
    most_improved_by_category: [],
    hidden_gems: [],
    trending_categories: [],
    platform_stats: [],
  }
}

export function installStripeFixture() {
  window.__sandboxStripeCalls = []
  const forbidden = () => {
    throw new Error("Real payment operations are disabled in the sandbox")
  }
  window.Stripe = () => ({
    elements: (options) => {
      window.__sandboxStripeCalls.push({ method: "elements", options })
      return { update() {}, on() {}, off() {} }
    },
    createToken: forbidden,
    createPaymentMethod: forbidden,
    confirmCardPayment: forbidden,
    confirmPayment: forbidden,
  })
}
