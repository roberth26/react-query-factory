# @robohall/react-query-factory

[![npm](https://img.shields.io/npm/v/@robohall/react-query-factory)](https://www.npmjs.com/package/@robohall/react-query-factory)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@robohall/react-query-factory)](https://bundlephobia.com/package/@robohall/react-query-factory)
[![license](https://img.shields.io/npm/l/@robohall/react-query-factory)](./LICENSE)

A factory function for TanStack Query configs. Instead of calling `useQuery` with ad-hoc options, you define a factory once and call it anywhere — getting consistent cache keys, automatic pagination crawling, and `useInfiniteQuery` support for free. TanStack's API stays fully exposed.

Zero runtime dependencies — all TanStack imports are type-only and erased at compile time.

---

## Installation

```bash
npm install @robohall/react-query-factory
# peer dependency: @tanstack/react-query >= 5.0.0
```

---

## Quick start

Define a factory once, call it in any component:

```typescript
import {
  EC2Client,
  DescribeInstancesCommand,
  type DescribeInstancesCommandInput,
} from '@aws-sdk/client-ec2';
import { queryFactory } from '@robohall/react-query-factory';
import { useQuery } from '@tanstack/react-query';

const ec2 = new EC2Client({ region: 'us-east-1' });

const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesCommandInput, ctx) =>
    ec2.send(new DescribeInstancesCommand(params), { abortSignal: ctx.signal }),
  staleTime: 30_000,
});

function InstanceList() {
  const { data } = useQuery(
    describeInstances({ Filters: [{ Name: 'instance-state-name', Values: ['running'] }] })
  );
  // query key:  ['ec2:DescribeInstances', { Filters: [...] }]
  // staleTime:  30 000 ms, no repetition required
}
```

`describeInstances({ ... })` returns a plain object — `{ queryKey, queryFn, staleTime, … }` — that you spread or pass directly to `useQuery`. The factory does not touch your query client.

---

## Crawling

`DescribeInstances` is paginated. If you have more than 1000 instances, one call won't get them all. The standard approach — chaining `fetchNextPage` calls, accumulating results, checking `NextToken` — is correct but tedious to repeat everywhere.

Add `getNextPageParam`, `initialPageParam`, and `reduce` to your factory config, and the generated `queryFn` will walk every page automatically, reducing them into a single flat array:

```typescript
import type { Instance, DescribeInstancesCommandInput } from '@aws-sdk/client-ec2';

const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesCommandInput, ctx) =>
    ec2.send(
      new DescribeInstancesCommand({ ...params, NextToken: ctx.pageParam }),
      { abortSignal: ctx.signal },
    ),
  getNextPageParam: response => response.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
  staleTime: 30_000,
});

function InstanceList() {
  // one useQuery call; data is Instance[], not DescribeInstancesResponse[]
  const { data } = useQuery(describeInstances({ MaxResults: 1000 }));
}
```

**`shouldFetchNextPage`** lets a call site stop the crawl early based on what has been accumulated so far. The arguments are the current reduced value and a `crawlOptions` object passed at call time:

```typescript
const describeInstances = queryFactory({
  // ...
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults != null && (instances?.length ?? 0) < opts.minResults,
});

// stop after accumulating at least 50 instances
const { data } = useQuery(
  describeInstances({ MaxResults: 1000 }, { minResults: 50 })
);
```

`crawlOptions` is appended to the query key, so `describeInstances({}, { minResults: 50 })` and `describeInstances({}, { minResults: 200 })` are separate cache entries — they crawl independently and never collide.

---

## Factory composition

A factory can inherit from another factory. The child's query key is appended to the parent's, standard options are shallow-merged, and the `queryFn` and crawling config can be inherited or replaced.

**Inherit the queryFn, add a `select` transform:**

```typescript
const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State?.Name === 'running'),
});

// query key:  ['ec2:DescribeInstances', { MaxResults: 1000 }]  (same cache entry as parent)
// data:       Instance[] filtered to State.Name === 'running'
const { data } = useQuery(runningInstances({ MaxResults: 1000 }));
```

Parent and child `select` functions compose automatically — if the parent already has a `select`, the child's `select` receives the parent's output, not the raw API response.

**Add a new queryFn under the parent's namespace:**

```typescript
const findInstance = queryFactory(describeInstances, {
  queryKey: ['find'],
  // queryFn, getNextPageParam, initialPageParam, and reduce are all inherited
  shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
    opts.instanceId != null &&
    !instances?.some(i => i.InstanceId === opts.instanceId),
});

// query key: ['ec2:DescribeInstances', 'find', { MaxResults: 100 }, { instanceId: 'i-0abc123' }]
// crawls pages until the target instance appears, then stops
const { data } = useQuery(
  findInstance({ MaxResults: 100 }, { instanceId: 'i-0abc123def456' })
);
```

Because `findInstance`'s key is nested under `['ec2:DescribeInstances']`, a single invalidation call busts the parent and all children:

```typescript
// after a runInstances/terminateInstances mutation — invalidates everything in the namespace.
// Calling the factory with no args produces just the namespace key; TanStack prefix-matches it
// against all entries, so describeInstances, runningInstances, and findInstance are all busted.
await queryClient.invalidateQueries(describeInstances());
```

---

## Infinite queries

Every factory exposes a `.infinite()` method that returns `useInfiniteQuery`-compatible options. If the factory has `reduce` configured, each virtual page is itself a crawl — TanStack loads pages one at a time, but each "page load" makes multiple API calls and reduces them before handing the result back:

```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
  // load 50 instances per UI page, each backed by up to 5 DescribeInstances calls
  describeInstances.infinite({ MaxResults: 10 }, { minResults: 50 })
);

// data.pages is Instance[][], one array per virtual page
```

The `.infinite()` key includes an `'infinite'` segment to keep it separate from the regular `useQuery` cache entry:
- `describeInstances({ MaxResults: 10 })` → `['ec2:DescribeInstances', { MaxResults: 10 }]`
- `describeInstances.infinite({ MaxResults: 10 })` → `['ec2:DescribeInstances', 'infinite', { MaxResults: 10 }]`

---

## Public API

### `queryFactory(config)`

Creates a standalone factory.

```typescript
queryFactory<TParams, TData, TError, TSelected, TPageParam, TCrawlOptions>(
  config: QueryFactoryConfig<...>
): QueryFactory<...>
```

### `queryFactory(parent, config)`

Creates a child factory. Two overloads:
- **With a new `queryFn`** — inherits key namespace and standard options; crawling config must be re-declared if needed.
- **Without a `queryFn`** — inherits everything; accepts only `queryKey`, `select`, and standard options. `select` is composed with the parent's.

### `QueryFactoryConfig`

All fields except `reduce` and `shouldFetchNextPage` are the standard TanStack Query API — the same types and semantics you'd pass to `useQuery` or `useInfiniteQuery`. The factory doesn't reinvent them; it just requires certain combinations to be present in order to activate crawling.

| Field | Type | Notes |
|---|---|---|
| `queryKey` | `QueryKey` | Namespace segments. Params are appended at call time. |
| `queryFn` | `(params: TParams, ctx: QueryFunctionContext) => TData \| Promise<TData>` | Same as TanStack, with an extra leading `params` argument. |
| `select` | `(data: TData) => TSelected` | Exact TanStack API. Composed automatically on child factories. |
| `getNextPageParam` | `GetNextPageParamFunction<TPageParam, TData>` | Exact TanStack API. Providing this together with `initialPageParam` and `reduce` activates crawling. |
| `initialPageParam` | `TPageParam` | Exact TanStack API. Required alongside `getNextPageParam` to enable crawling. |
| `getPreviousPageParam` | `GetPreviousPageParamFunction<TPageParam, TData>` | Exact TanStack API. Passed through on `.infinite()`. |
| `reduce` | `(acc: TSelected \| undefined, page: TData) => TSelected` | Library addition. Folds crawled pages into a single value; required for crawling and `.infinite()` crawling. |
| `shouldFetchNextPage` | `(combined: TSelected \| undefined, crawlOptions: TCrawlOptions) => boolean` | Library addition. Return `false` to stop the crawl early based on accumulated results. |
| + all `StandardQueryOptions` fields | | `staleTime`, `gcTime`, `retry`, `enabled`, `refetchOnWindowFocus`, etc. |

### `QueryFactory<TParams, TData, TError, TSelected, TPageParam, TCrawlOptions>`

The callable factory returned by `queryFactory()`.

```typescript
factory(params: TParams, crawlOptions?: TCrawlOptions): ResolvedQueryOptions  // → useQuery()
factory.infinite(params, crawlOptions?)                : ResolvedInfiniteOptions // → useInfiniteQuery()
```

### `ResolvedQueryOptions`

Return type of `factory(params)`. Pass directly to `useQuery()`. Contains an `initialPageParam?: never` field that prevents accidental use with `useInfiniteQuery`.

### `ResolvedInfiniteOptions`

Return type of `factory.infinite(params)`. Pass directly to `useInfiniteQuery()`. The `select` field is typed to `InfiniteData<TData, TPageParam>`, which prevents accidental use with `useQuery`.

---

## Running the sandbox

The sandbox contains six interactive demos using a mock paginated API: basic single-page fetch, full crawl, factory composition, infinite query with per-page crawling, early-stop target search, and namespace-based cache invalidation.

```bash
npm run sandbox
```

This starts a Vite dev server. Navigate to the URL it prints (typically `http://localhost:5173`).
