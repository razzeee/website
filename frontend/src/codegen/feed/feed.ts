/**
 * Generated by orval 🍺
 * Do not edit manually.
 * Flathub API
 * OpenAPI spec version: 0.1.0
 */
import { useQuery } from "@tanstack/react-query"
import type {
  QueryFunction,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import axios from "axios"
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"

/**
 * @summary Get Recently Updated Apps Feed
 */
export const getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet = (
  options?: AxiosRequestConfig,
): Promise<AxiosResponse<unknown>> => {
  return axios.get(`/feed/recently-updated`, options)
}

export const getGetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryKey =
  () => {
    return [`/feed/recently-updated`] as const
  }

export const getGetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryOptions = <
  TData = Awaited<
    ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>
  >,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<
        ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>
      >,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {}

  const queryKey =
    queryOptions?.queryKey ??
    getGetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryKey()

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>>
  > = ({ signal }) =>
    getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet({
      signal,
      ...axiosOptions,
    })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<
      ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>
    >,
    TError,
    TData
  > & { queryKey: QueryKey }
}

export type GetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryResult =
  NonNullable<
    Awaited<ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>>
  >
export type GetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryError =
  AxiosError<unknown>

/**
 * @summary Get Recently Updated Apps Feed
 */
export const useGetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet = <
  TData = Awaited<
    ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>
  >,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<
        ReturnType<typeof getRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGet>
      >,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
  const queryOptions =
    getGetRecentlyUpdatedAppsFeedFeedRecentlyUpdatedGetQueryOptions(options)

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey
  }

  query.queryKey = queryOptions.queryKey

  return query
}

/**
 * @summary Get New Apps Feed
 */
export const getNewAppsFeedFeedNewGet = (
  options?: AxiosRequestConfig,
): Promise<AxiosResponse<unknown>> => {
  return axios.get(`/feed/new`, options)
}

export const getGetNewAppsFeedFeedNewGetQueryKey = () => {
  return [`/feed/new`] as const
}

export const getGetNewAppsFeedFeedNewGetQueryOptions = <
  TData = Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {}

  const queryKey =
    queryOptions?.queryKey ?? getGetNewAppsFeedFeedNewGetQueryKey()

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>
  > = ({ signal }) => getNewAppsFeedFeedNewGet({ signal, ...axiosOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>,
    TError,
    TData
  > & { queryKey: QueryKey }
}

export type GetNewAppsFeedFeedNewGetQueryResult = NonNullable<
  Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>
>
export type GetNewAppsFeedFeedNewGetQueryError = AxiosError<unknown>

/**
 * @summary Get New Apps Feed
 */
export const useGetNewAppsFeedFeedNewGet = <
  TData = Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<typeof getNewAppsFeedFeedNewGet>>,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
  const queryOptions = getGetNewAppsFeedFeedNewGetQueryOptions(options)

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey
  }

  query.queryKey = queryOptions.queryKey

  return query
}

/**
 * @summary Get Recently Updated Apps Feed Postgres
 */
export const getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet =
  (options?: AxiosRequestConfig): Promise<AxiosResponse<unknown>> => {
    return axios.get(`/feed/recently-updated-postgres`, options)
  }

export const getGetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryKey =
  () => {
    return [`/feed/recently-updated-postgres`] as const
  }

export const getGetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryOptions =
  <
    TData = Awaited<
      ReturnType<
        typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
      >
    >,
    TError = AxiosError<unknown>,
  >(options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<
          ReturnType<
            typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
          >
        >,
        TError,
        TData
      >
    >
    axios?: AxiosRequestConfig
  }) => {
    const { query: queryOptions, axios: axiosOptions } = options ?? {}

    const queryKey =
      queryOptions?.queryKey ??
      getGetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryKey()

    const queryFn: QueryFunction<
      Awaited<
        ReturnType<
          typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
        >
      >
    > = ({ signal }) =>
      getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet({
        signal,
        ...axiosOptions,
      })

    return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
      Awaited<
        ReturnType<
          typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
        >
      >,
      TError,
      TData
    > & { queryKey: QueryKey }
  }

export type GetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryResult =
  NonNullable<
    Awaited<
      ReturnType<
        typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
      >
    >
  >
export type GetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryError =
  AxiosError<unknown>

/**
 * @summary Get Recently Updated Apps Feed Postgres
 */
export const useGetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet =
  <
    TData = Awaited<
      ReturnType<
        typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
      >
    >,
    TError = AxiosError<unknown>,
  >(options?: {
    query?: Partial<
      UseQueryOptions<
        Awaited<
          ReturnType<
            typeof getRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGet
          >
        >,
        TError,
        TData
      >
    >
    axios?: AxiosRequestConfig
  }): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
    const queryOptions =
      getGetRecentlyUpdatedAppsFeedPostgresFeedRecentlyUpdatedPostgresGetQueryOptions(
        options,
      )

    const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
      queryKey: QueryKey
    }

    query.queryKey = queryOptions.queryKey

    return query
  }

/**
 * @summary Get New Apps Feed Postgres
 */
export const getNewAppsFeedPostgresFeedNewPostgresGet = (
  options?: AxiosRequestConfig,
): Promise<AxiosResponse<unknown>> => {
  return axios.get(`/feed/new-postgres`, options)
}

export const getGetNewAppsFeedPostgresFeedNewPostgresGetQueryKey = () => {
  return [`/feed/new-postgres`] as const
}

export const getGetNewAppsFeedPostgresFeedNewPostgresGetQueryOptions = <
  TData = Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}) => {
  const { query: queryOptions, axios: axiosOptions } = options ?? {}

  const queryKey =
    queryOptions?.queryKey ??
    getGetNewAppsFeedPostgresFeedNewPostgresGetQueryKey()

  const queryFn: QueryFunction<
    Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>
  > = ({ signal }) =>
    getNewAppsFeedPostgresFeedNewPostgresGet({ signal, ...axiosOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>,
    TError,
    TData
  > & { queryKey: QueryKey }
}

export type GetNewAppsFeedPostgresFeedNewPostgresGetQueryResult = NonNullable<
  Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>
>
export type GetNewAppsFeedPostgresFeedNewPostgresGetQueryError =
  AxiosError<unknown>

/**
 * @summary Get New Apps Feed Postgres
 */
export const useGetNewAppsFeedPostgresFeedNewPostgresGet = <
  TData = Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>,
  TError = AxiosError<unknown>,
>(options?: {
  query?: Partial<
    UseQueryOptions<
      Awaited<ReturnType<typeof getNewAppsFeedPostgresFeedNewPostgresGet>>,
      TError,
      TData
    >
  >
  axios?: AxiosRequestConfig
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
  const queryOptions =
    getGetNewAppsFeedPostgresFeedNewPostgresGetQueryOptions(options)

  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & {
    queryKey: QueryKey
  }

  query.queryKey = queryOptions.queryKey

  return query
}
