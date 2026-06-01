# @robohall/react-query-factory

[![npm](https://img.shields.io/npm/v/@robohall/react-query-factory)](https://www.npmjs.com/package/@robohall/react-query-factory)
![minified](https://img.shields.io/badge/minified-%3C_12_kB-blue)
![gzipped](https://img.shields.io/badge/gzipped-%3C_3_kB-blue)
[![license](https://img.shields.io/npm/l/@robohall/react-query-factory)](./LICENSE)

<p align="center">
  <a href="https://roberth26.github.io/react-query-factory/"><strong>Visit the Sandbox</strong></a>
</p>

TanStack Query handles caching, syncing, and invalidation. What it doesn't do is crawl paginated APIs for you. This library adds that — a factory function that wraps your `queryFn` with a configurable crawl loop so `useQuery` can return accumulated results instead of a single page. The `queryFn` can be a plain async function or an async iterable (e.g. an AWS SDK paginator), with no cursor wiring required in the latter case. The same factory produces `useInfiniteQuery` options, composes into child factories that share the cache, and exposes scope-aware invalidation keys. TanStack's API stays fully exposed at every call site.

Zero runtime dependencies.

---

## The problem

### Step 1 — wrap `useQuery` in a custom hook

The first instinct when a query is reused across components:

```typescript
function useInstances(params: DescribeInstancesCommandInput) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => fetchInstances(params),
  });
}
```

Works, until requirements grow. You need a `select` option — so the hook grows a generic. You need a `useInfiniteQuery` variant — so you write a second hook with a key differentiator to avoid a cache collision. You need to prefetch in a route loader — but the key is trapped inside the hook.

```typescript
function useInstances<TSelected = Instance[]>(
  params: DescribeInstancesCommandInput,
  options?: { select?: (data: Instance[]) => TSelected },
) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => fetchInstances(params),
    select: options?.select,
  });
}

// separate hook, duplicated key and queryFn, must stay in sync manually
function useInstancesInfinite(params: DescribeInstancesCommandInput) {
  return useInfiniteQuery({
    queryKey: ['instances', 'infinite', params],
    // ...
  });
}
```

The generics multiply with every new transform. The key is still trapped — prefetching and invalidation still can't reach it from outside.

### Step 2 — `queryOptions` for colocation

TanStack's `queryOptions` helper moves the key and fn into a shared object:

```typescript
const instancesOptions = (params: DescribeInstancesCommandInput) =>
  queryOptions({
    queryKey: ['instances', params],
    queryFn: () => fetchInstances(params),
  });

useQuery(instancesOptions(params));
queryClient.prefetchQuery(instancesOptions(params));
queryClient.invalidateQueries(instancesOptions(params));
```

This is genuinely good — this library builds on the same pattern. But once you need multiple related queries, the cracks show.

### Step 3 — derived queries and key coordination

Say you want a running-instances view that shares the same cache entry as the full list. The natural move is to spread the base options and override `select`:

```typescript
const { data: running } = useQuery({
  ...instancesOptions(params),
  select: data => data.filter(i => i.state === 'running'),
});
```

No key or `queryFn` duplication — this is the right approach. But `select` can only be applied at the call site, not captured in `instancesOptions` itself. And after a mutation you still need a magic string to bust the cache:

```typescript
// If the key structure ever changes, every site breaks.
queryClient.invalidateQueries({ queryKey: ['instances'] });
```

### Step 4 — paginated APIs

`DescribeInstances` returns at most `MaxResults` instances per call. To get them all, you need to loop. The usual options:

**Put the loop in `queryFn`:**

```typescript
const instancesOptions = params =>
  queryOptions({
    queryKey: ['instances', params],
    queryFn: async () => {
      let all: Instance[] = [];
      let nextToken: string | undefined;
      do {
        const page = await ec2.send(
          new DescribeInstancesCommand({ ...params, NextToken: nextToken }),
        );
        all = [
          ...all,
          ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
        ];
        nextToken = page.NextToken;
      } while (nextToken);
      return all;
    },
  });
```

The crawl logic is now baked in. Every call site gets all pages — you can't stop at 50 for a dropdown while fetching all for a table. The loop gets copy-pasted into every paginated query.

**Use `useInfiniteQuery`:**

```typescript
const instancesInfiniteOptions = params =>
  infiniteQueryOptions({
    queryKey: ['instances', 'infinite', params],
    queryFn: ({ pageParam }) =>
      ec2.send(
        new DescribeInstancesCommand({ ...params, NextToken: pageParam }),
      ),
    getNextPageParam: r => r.NextToken,
    initialPageParam: undefined,
  });

// Caller still has to flatten, auto-advance, manage hasNextPage...
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
  instancesInfiniteOptions(params),
);
const allInstances = data?.pages.flatMap(
  page => page.Reservations?.flatMap(r => r.Instances ?? []) ?? [],
);
```

Now you have two separate factories that duplicate the key and queryFn and need to stay in sync. `useQuery` and `useInfiniteQuery` are separate cache entries. Derived queries, invalidation, and prefetching all have to be wired up independently for each.

### What's missing

- Define the query **once**: key, queryFn, pagination config
- Let each **call site** decide how much to crawl (e.g. 50 records, all of them, or none)
- Optionally have `useQuery` crawl and return the **accumulated result** instead of a single page
- Use **async iterables** as `queryFn` — pass a paginator function directly, no cursor wiring required
- Have `.infinite()` available on the **same factory**, no duplication
- Have derived queries **share the cache entry** automatically
- Have **scoped invalidation** through key composition — bust the whole namespace or just one param set and its children

---

## The solution

```typescript
import { queryFactory } from '@robohall/react-query-factory';

const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesCommandInput, ctx) =>
    ec2.send(
      new DescribeInstancesCommand({ ...params, NextToken: ctx.pageParam }),
      {
        abortSignal: ctx.signal,
      },
    ),
  getNextPageParam: r => r.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults == null || instances.length < opts.minResults,
});

// useQuery — crawls all pages, data is Instance[]
const { data } = useQuery(describeInstances({ MaxResults: 20 }));

// Stop at 50 — separate cache entry, independent crawl
const { data } = useQuery(
  describeInstances({ MaxResults: 20 }, { minResults: 50 }),
);

// UI-driven pagination — same factory, no duplication
const { data, fetchNextPage } = useInfiniteQuery(
  describeInstances.infinite({ MaxResults: 20 }, { minResults: 50 }),
);

// Derived view — shares the cache entry, no extra API call
const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State?.Name === 'running'),
});
const { data: running } = useQuery(runningInstances({ MaxResults: 20 }));

// Prefetch in a route loader
await queryClient.prefetchQuery(describeInstances({ MaxResults: 20 }));

// Bust everything in the namespace
queryClient.invalidateQueries(describeInstances());

// Bust only this param set — cascades to runningInstances and any other child
queryClient.invalidateQueries(describeInstances({ MaxResults: 20 }));
```

`describeInstances({ ... })` returns a plain `{ queryKey, queryFn, ... }` object — pass it directly to `useQuery`, `useInfiniteQuery`, `prefetchQuery`, or `getQueryData`. The factory doesn't touch your query client.

---

## Installation

```bash
npm install @robohall/react-query-factory
# peer dependency: @tanstack/react-query >= 5.0.0
```

---

## Crawling

`shouldFetchNextPage` is called after each page — return `true` to keep fetching, `false` to stop. `getNextPageParam` and `initialPageParam` follow the exact TanStack API. `reduce` folds pages into a single accumulated value; without it the result is an array of raw pages (`TData[]`).

The `crawlOptions` argument passed at call time is forwarded to `shouldFetchNextPage` and appended to the query key, so different call sites crawl independently and never share a cache entry:

```typescript
const describeInstances = queryFactory({
  // ...
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults == null || instances.length < opts.minResults,
});

// two separate cache entries — crawl independently
const { data: all } = useQuery(describeInstances({ MaxResults: 20 }));
const { data: partial } = useQuery(
  describeInstances({ MaxResults: 20 }, { minResults: 50 }),
);
```

---

## Async iterator queryFns

When `queryFn` returns an `AsyncIterable`, the library detects it automatically and drives the crawl with `for await...of` instead of the cursor loop. This means `getNextPageParam` and `initialPageParam` are not required — the iterator manages its own cursor. AWS SDK v3 paginator functions (`paginateDescribeInstances`, etc.) are a common source of async iterables:

```typescript
import { paginateDescribeInstances } from '@aws-sdk/client-ec2';

const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesCommandInput) =>
    paginateDescribeInstances({ client: ec2 }, params),
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults == null || instances.length < opts.minResults,
  reduce: (acc, page: DescribeInstancesResponse): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
});
```

`shouldFetchNextPage` still controls early stopping — the library calls `next()` on the iterator only when it returns `true`. Any source of `AsyncIterable<TPage>` works, not just AWS SDK paginators.

For `.infinite()` mode, `getNextPageParam` is required to capture the next virtual page's starting cursor from the last yielded item. AWS SDK v3 paginators accept a `startingToken` to resume from a specific position — wire `ctx.pageParam` to it:

```typescript
const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesCommandInput, ctx) =>
    paginateDescribeInstances(
      { client: ec2 },
      { ...params, StartingToken: ctx.pageParam },
    ),
  getNextPageParam: page => page.NextToken,
  initialPageParam: undefined as string | undefined,
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults == null || instances.length < opts.minResults,
  reduce: (acc, page): Instance[] => [
    ...(acc ?? []),
    ...(page.Instances ?? []),
  ],
});

const { data, fetchNextPage } = useInfiniteQuery(
  describeInstances.infinite({ MaxResults: 20 }, { minResults: 50 }),
);
```

---

## Factory composition

A factory can inherit from another factory. The child's query key is appended to the parent's, standard options are shallow-merged, and the `queryFn` and crawling config can be inherited or replaced.

**Inherit the queryFn, add a `select` transform:**

```typescript
const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State?.Name === 'running'),
});

// query key:  ['ec2:DescribeInstances', { MaxResults: 20 }]  (same cache entry as parent)
// data:       Instance[] filtered to State.Name === 'running'
const { data } = useQuery(runningInstances({ MaxResults: 20 }));
```

Parent and child `select` functions compose automatically — if the parent already has a `select`, the child's `select` receives the parent's output, not the raw API response.

**Add a new queryFn under the parent's namespace:**

```typescript
const findInstance = queryFactory(describeInstances, {
  queryKey: ['find'],
  // queryFn, getNextPageParam, initialPageParam, and reduce are all inherited
  shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
    opts.instanceId != null &&
    !instances.some(i => i.InstanceId === opts.instanceId),
});

// query key: ['ec2:DescribeInstances', { MaxResults: 20 }, 'find', { instanceId: 'i-0abc123def456' }]
// crawls pages until the target instance appears, then stops
const { data } = useQuery(
  findInstance({ MaxResults: 20 }, { instanceId: 'i-0abc123def456' }),
);
```

**Invalidation — broad and scoped:**

Child keys follow the ordering `[...parentNS, params, ...childSegments]`, which means the parent key for a given set of params is always a strict prefix of every child key for those same params:

```
describeInstances({ MaxResults: 20 })
  → ['ec2:DescribeInstances', { MaxResults: 20 }]

runningInstances({ MaxResults: 20 })          // select child, no own segments
  → ['ec2:DescribeInstances', { MaxResults: 20 }]  (same entry — select is not in the key)

findInstance({ MaxResults: 20 }, { instanceId: 'i-abc' })
  → ['ec2:DescribeInstances', { MaxResults: 20 }, 'find', { instanceId: 'i-abc' }]
//                              └── params ──────┘ └── own segs ──────────────────┘
```

This unlocks two invalidation granularities with no extra bookkeeping:

```typescript
// Broad: zero-arg returns the namespace — busts every variant, every param set
await queryClient.invalidateQueries(describeInstances());

// Scoped: parent call with params — busts the parent and every child for those params only
await queryClient.invalidateQueries(describeInstances({ MaxResults: 20 }));
```

The scoped form is particularly useful after a targeted mutation: invalidate the one resource that changed without touching unrelated cache entries.

---

## Infinite queries

Every factory exposes a `.infinite()` method that returns `useInfiniteQuery`-compatible options. If the factory has `reduce` configured, each virtual page is itself a crawl — TanStack loads pages one at a time, but each "page load" makes multiple API calls and reduces them before handing the result back:

```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
  // load 50 instances per UI page, each backed by up to 5 DescribeInstances calls
  describeInstances.infinite({ MaxResults: 20 }, { minResults: 50 }),
);

// data.pages is Instance[][], one array per virtual page
```

The `.infinite()` key includes an `'infinite'` segment to keep it separate from the regular `useQuery` cache entry:

- `describeInstances({ MaxResults: 20 })` → `['ec2:DescribeInstances', { MaxResults: 20 }]`
- `describeInstances.infinite({ MaxResults: 20 })` → `['ec2:DescribeInstances', 'infinite', { MaxResults: 20 }]`

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
- **Without a `queryFn`** — inherits everything; accepts `queryKey`, `select`, standard options, and any crawling fields (`shouldFetchNextPage`, `reduce`, `getNextPageParam`, `getPreviousPageParam`, `initialPageParam`) to override the parent's. `select` is composed with the parent's.

### `QueryFactoryConfig`

All fields except `reduce` and `shouldFetchNextPage` are the standard TanStack Query API — the same types and semantics you'd pass to `useQuery` or `useInfiniteQuery`. The factory doesn't reinvent them; it just requires certain combinations to be present in order to activate crawling.

| Field                               | Type                                                                                              | Notes                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queryKey`                          | `QueryKey`                                                                                        | Namespace segments. Params are appended at call time.                                                                                                                                   |
| `queryFn`                           | `(params: TParams, ctx: QueryFunctionContext) => TData \| Promise<TData> \| AsyncIterable<TData>` | Same as TanStack, with an extra leading `params` argument. Returns an `AsyncIterable` to use iterator-based crawling.                                                                   |
| `select`                            | `(data: TData) => TSelected`                                                                      | Exact TanStack API. Composed automatically on child factories.                                                                                                                          |
| `getNextPageParam`                  | `GetNextPageParamFunction<TPageParam, TData>`                                                     | Exact TanStack API. Required (with `shouldFetchNextPage`) to activate cursor-based crawling. Required (with `initialPageParam`) for `.infinite()`.                                      |
| `initialPageParam`                  | `TPageParam`                                                                                      | Exact TanStack API. Drives `TPageParam` inference. Required for `.infinite()` to work at runtime.                                                                                       |
| `getPreviousPageParam`              | `GetPreviousPageParamFunction<TPageParam, TData>`                                                 | Exact TanStack API. Passed through on `.infinite()`.                                                                                                                                    |
| `shouldFetchNextPage`               | `(combined: TSelected \| undefined, crawlOptions: TCrawlOptions) => boolean`                      | Library addition. **Required to activate crawling.** Called after each page — return `true` to keep fetching, `false` to stop.                                                          |
| `reduce`                            | `(acc: TSelected \| undefined, page: TData) => TSelected`                                         | Library addition. Optional. Folds crawled pages into a single `TSelected` value; when omitted the result is an array of all fetched raw pages (`TData[]`).                              |
| + all `StandardQueryOptions` fields |                                                                                                   | `staleTime`, `gcTime`, `retry`, `enabled`, `refetchOnWindowFocus`, `placeholderData`, `initialData`, `meta`, etc. Function-form callbacks are supported wherever TanStack accepts them. |

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

```bash
npm run sandbox
```

Starts a Vite dev server with interactive demos covering every pattern: basic single-page fetch, async iterator queryFns, crawl-then-render, render-while-crawling, on-demand infinite pagination, client-side search with early stopping, factory composition, and scoped cache invalidation.
