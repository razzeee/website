import { defineConfig } from "orval"

// Generate this admin module independently without rewriting unrelated clients.
export default defineConfig({
  maintenance: {
    input: {
      target:
        process.env.MAINTENANCE_OPENAPI_URL ??
        "http://localhost:8000/openapi.json",
      filters: {
        tags: ["maintenance"],
        // The Axios client exposes success responses only; do not emit
        // validation-error models that nothing imports.
        schemas: [/^Maintenance/, /^RuntimeCampaign$/],
      },
    },
    output: {
      target: "./src/codegen-maintenance/maintenance.ts",
      schemas: "./src/codegen-maintenance/model",
      client: "axios",
      baseUrl: "",
      formatter: "prettier",
      clean: ["./src/codegen-maintenance"],
    },
  },
})
