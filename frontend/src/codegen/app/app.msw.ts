/**
 * Generated by orval 🍺
 * Do not edit manually.
 * Flathub API
 * OpenAPI spec version: 0.1.0
 */
import { faker } from "@faker-js/faker"
import { HttpResponse, delay, http } from "msw"
import type {
  GetEolMessageAppidEolMessageAppIdGet200,
  GetEolMessageEolMessageGet200,
  GetEolRebaseAppidEolRebaseAppIdGet200,
  GetEolRebaseEolRebaseGet200,
  GetPlatformsPlatformsGet200,
  GetRuntimeListRuntimesGet200,
  GetStatsStatsGet200,
} from ".././model"

export const getGetCategoriesCategoriesGetResponseMock = (): string[] =>
  Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, () =>
    faker.word.sample(),
  )

export const getGetDevelopersDeveloperGetResponseMock = (): string[] =>
  Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, () =>
    faker.word.sample(),
  )

export const getGetEolRebaseEolRebaseGetResponseMock =
  (): GetEolRebaseEolRebaseGet200 => ({
    [faker.string.alphanumeric(5)]: Array.from(
      { length: faker.number.int({ min: 1, max: 10 }) },
      (_, i) => i + 1,
    ).map(() => faker.word.sample()),
  })

export const getGetEolRebaseAppidEolRebaseAppIdGetResponseMock =
  (): GetEolRebaseAppidEolRebaseAppIdGet200 =>
    faker.helpers.arrayElement([faker.word.sample(), null])

export const getGetEolMessageEolMessageGetResponseMock =
  (): GetEolMessageEolMessageGet200 => ({
    [faker.string.alphanumeric(5)]: faker.word.sample(),
  })

export const getGetEolMessageAppidEolMessageAppIdGetResponseMock =
  (): GetEolMessageAppidEolMessageAppIdGet200 =>
    faker.helpers.arrayElement([faker.word.sample(), null])

export const getListAppstreamAppstreamGetResponseMock = (): string[] =>
  Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, () =>
    faker.word.sample(),
  )

export const getGetIsFullscreenAppIsFullscreenAppAppIdGetResponseMock =
  (): boolean => faker.datatype.boolean()

export const getGetRuntimeListRuntimesGetResponseMock =
  (): GetRuntimeListRuntimesGet200 => ({
    [faker.string.alphanumeric(5)]: faker.number.int({
      min: undefined,
      max: undefined,
    }),
  })

export const getGetStatsStatsGetResponseMock = (): GetStatsStatsGet200 =>
  faker.helpers.arrayElement([
    {
      category_totals: {
        [faker.string.alphanumeric(5)]: faker.number.int({
          min: undefined,
          max: undefined,
        }),
      },
      countries: {
        [faker.string.alphanumeric(5)]: faker.number.int({
          min: undefined,
          max: undefined,
        }),
      },
      delta_downloads_per_day: {
        [faker.string.alphanumeric(5)]: faker.number.int({
          min: undefined,
          max: undefined,
        }),
      },
      downloads: faker.number.int({ min: undefined, max: undefined }),
      downloads_per_day: {
        [faker.string.alphanumeric(5)]: faker.number.int({
          min: undefined,
          max: undefined,
        }),
      },
      number_of_apps: faker.number.int({ min: undefined, max: undefined }),
      updates_per_day: {
        [faker.string.alphanumeric(5)]: faker.number.int({
          min: undefined,
          max: undefined,
        }),
      },
    },
    null,
  ])

export const getGetPlatformsPlatformsGetResponseMock =
  (): GetPlatformsPlatformsGet200 => ({
    [faker.string.alphanumeric(5)]: {
      aliases: Array.from(
        { length: faker.number.int({ min: 1, max: 10 }) },
        (_, i) => i + 1,
      ).map(() => faker.word.sample()),
      depends: faker.helpers.arrayElement([
        faker.helpers.arrayElement([faker.word.sample(), null]),
        undefined,
      ]),
      keep: faker.number.int({ min: undefined, max: undefined }),
      stripe_account: faker.helpers.arrayElement([
        faker.helpers.arrayElement([faker.word.sample(), null]),
        undefined,
      ]),
    },
  })

export const getGetAddonsAddonAppIdGetResponseMock = (): string[] =>
  Array.from({ length: faker.number.int({ min: 1, max: 10 }) }, () =>
    faker.word.sample(),
  )

export const getGetCategoriesCategoriesGetMockHandler = (
  overrideResponse?:
    | string[]
    | ((info: Parameters<Parameters<typeof http.get>[1]>[0]) => string[]),
) => {
  return http.get("*/categories", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetCategoriesCategoriesGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetCategoryCategoryCategoryGetMockHandler = () => {
  return http.get("*/category/:category", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetSubcategoryCategoryCategorySubcategoriesSubcategoryGetMockHandler =
  () => {
    return http.get(
      "*/category/:category/subcategories/:subcategory",
      async () => {
        await delay(1000)
        return new HttpResponse(null, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        })
      },
    )
  }

export const getGetDevelopersDeveloperGetMockHandler = (
  overrideResponse?:
    | string[]
    | ((info: Parameters<Parameters<typeof http.get>[1]>[0]) => string[]),
) => {
  return http.get("*/developer", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetDevelopersDeveloperGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetDeveloperDeveloperDeveloperGetMockHandler = () => {
  return http.get("*/developer/:developer", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetEolRebaseEolRebaseGetMockHandler = (
  overrideResponse?:
    | GetEolRebaseEolRebaseGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetEolRebaseEolRebaseGet200),
) => {
  return http.get("*/eol/rebase", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetEolRebaseEolRebaseGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetEolRebaseAppidEolRebaseAppIdGetMockHandler = (
  overrideResponse?:
    | GetEolRebaseAppidEolRebaseAppIdGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetEolRebaseAppidEolRebaseAppIdGet200),
) => {
  return http.get("*/eol/rebase/:appId", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetEolRebaseAppidEolRebaseAppIdGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetEolMessageEolMessageGetMockHandler = (
  overrideResponse?:
    | GetEolMessageEolMessageGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetEolMessageEolMessageGet200),
) => {
  return http.get("*/eol/message", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetEolMessageEolMessageGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetEolMessageAppidEolMessageAppIdGetMockHandler = (
  overrideResponse?:
    | GetEolMessageAppidEolMessageAppIdGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetEolMessageAppidEolMessageAppIdGet200),
) => {
  return http.get("*/eol/message/:appId", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetEolMessageAppidEolMessageAppIdGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getListAppstreamAppstreamGetMockHandler = (
  overrideResponse?:
    | string[]
    | ((info: Parameters<Parameters<typeof http.get>[1]>[0]) => string[]),
) => {
  return http.get("*/appstream", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getListAppstreamAppstreamGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetAppstreamAppstreamAppIdGetMockHandler = () => {
  return http.get("*/appstream/:appId", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetIsFullscreenAppIsFullscreenAppAppIdGetMockHandler = (
  overrideResponse?:
    | boolean
    | ((info: Parameters<Parameters<typeof http.get>[1]>[0]) => boolean),
) => {
  return http.get("*/is-fullscreen-app/:appId", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetIsFullscreenAppIsFullscreenAppAppIdGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getPostSearchSearchPostMockHandler = () => {
  return http.post("*/search", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetRuntimeListRuntimesGetMockHandler = (
  overrideResponse?:
    | GetRuntimeListRuntimesGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetRuntimeListRuntimesGet200),
) => {
  return http.get("*/runtimes", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetRuntimeListRuntimesGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetRecentlyUpdatedCollectionRecentlyUpdatedGetMockHandler =
  () => {
    return http.get("*/collection/recently-updated", async () => {
      await delay(1000)
      return new HttpResponse(null, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    })
  }

export const getGetRecentlyAddedCollectionRecentlyAddedGetMockHandler = () => {
  return http.get("*/collection/recently-added", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetVerifiedCollectionVerifiedGetMockHandler = () => {
  return http.get("*/collection/verified", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetPopularLastMonthPopularLastMonthGetMockHandler = () => {
  return http.get("*/popular/last-month", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetTrendingLastTwoWeeksTrendingLastTwoWeeksGetMockHandler =
  () => {
    return http.get("*/trending/last-two-weeks", async () => {
      await delay(1000)
      return new HttpResponse(null, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    })
  }

export const getGetStatsStatsGetMockHandler = (
  overrideResponse?:
    | GetStatsStatsGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetStatsStatsGet200),
) => {
  return http.get("*/stats", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetStatsStatsGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetStatsForAppStatsAppIdGetMockHandler = () => {
  return http.get("*/stats/:appId", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetSummarySummaryAppIdGetMockHandler = () => {
  return http.get("*/summary/:appId", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetPlatformsPlatformsGetMockHandler = (
  overrideResponse?:
    | GetPlatformsPlatformsGet200
    | ((
        info: Parameters<Parameters<typeof http.get>[1]>[0],
      ) => GetPlatformsPlatformsGet200),
) => {
  return http.get("*/platforms", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetPlatformsPlatformsGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}

export const getGetExceptionsExceptionsGetMockHandler = () => {
  return http.get("*/exceptions", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetExceptionsForAppExceptionsAppIdGetMockHandler = () => {
  return http.get("*/exceptions/:appId", async () => {
    await delay(1000)
    return new HttpResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  })
}

export const getGetAddonsAddonAppIdGetMockHandler = (
  overrideResponse?:
    | string[]
    | ((info: Parameters<Parameters<typeof http.get>[1]>[0]) => string[]),
) => {
  return http.get("*/addon/:appId", async (info) => {
    await delay(1000)
    return new HttpResponse(
      JSON.stringify(
        overrideResponse !== undefined
          ? typeof overrideResponse === "function"
            ? overrideResponse(info)
            : overrideResponse
          : getGetAddonsAddonAppIdGetResponseMock(),
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })
}
export const getAppMock = () => [
  getGetCategoriesCategoriesGetMockHandler(),
  getGetCategoryCategoryCategoryGetMockHandler(),
  getGetSubcategoryCategoryCategorySubcategoriesSubcategoryGetMockHandler(),
  getGetDevelopersDeveloperGetMockHandler(),
  getGetDeveloperDeveloperDeveloperGetMockHandler(),
  getGetEolRebaseEolRebaseGetMockHandler(),
  getGetEolRebaseAppidEolRebaseAppIdGetMockHandler(),
  getGetEolMessageEolMessageGetMockHandler(),
  getGetEolMessageAppidEolMessageAppIdGetMockHandler(),
  getListAppstreamAppstreamGetMockHandler(),
  getGetAppstreamAppstreamAppIdGetMockHandler(),
  getGetIsFullscreenAppIsFullscreenAppAppIdGetMockHandler(),
  getPostSearchSearchPostMockHandler(),
  getGetRuntimeListRuntimesGetMockHandler(),
  getGetRecentlyUpdatedCollectionRecentlyUpdatedGetMockHandler(),
  getGetRecentlyAddedCollectionRecentlyAddedGetMockHandler(),
  getGetVerifiedCollectionVerifiedGetMockHandler(),
  getGetPopularLastMonthPopularLastMonthGetMockHandler(),
  getGetTrendingLastTwoWeeksTrendingLastTwoWeeksGetMockHandler(),
  getGetStatsStatsGetMockHandler(),
  getGetStatsForAppStatsAppIdGetMockHandler(),
  getGetSummarySummaryAppIdGetMockHandler(),
  getGetPlatformsPlatformsGetMockHandler(),
  getGetExceptionsExceptionsGetMockHandler(),
  getGetExceptionsForAppExceptionsAppIdGetMockHandler(),
  getGetAddonsAddonAppIdGetMockHandler(),
]
