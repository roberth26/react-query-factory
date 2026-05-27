import type {
	QueryKey,
	QueryFunctionContext,
	GetNextPageParamFunction,
	GetPreviousPageParamFunction,
	InfiniteData,
	QueryObserverOptions,
} from '@tanstack/react-query';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * All TanStack Query options that apply to both regular and infinite queries,
 * derived directly from `QueryObserverOptions` so it stays in sync with TanStack.
 *
 * Fields owned by the factory (`queryKey`, `queryFn`, `select`) and internal
 * implementation details (`behavior`, `_defaulted`, `_type`, `_optimisticResults`,
 * `queryHash`) are omitted.
 */
export type StandardQueryOptions<TError = Error, TData = unknown> = Omit<
	QueryObserverOptions<TData, TError, TData, TData, QueryKey>,
	| 'queryKey'
	| 'queryFn'
	| 'select'
	| 'behavior'
	| '_defaulted'
	| '_type'
	| '_optimisticResults'
	| 'queryHash'
>;

/**
 * Configuration passed to `queryFactory()`.
 *
 * - Set only `queryKey` + `queryFn` for a basic single-page query.
 * - Add `getNextPageParam`, `initialPageParam`, and `reduce` to enable automatic
 *   pagination: the generated `queryFn` crawls all pages and reduces them to a
 *   single `TSelected` value.
 * - Call `factory.infinite(params)` to get a `useInfiniteQuery`-compatible config
 *   where each virtual page is itself a crawl.
 *
 * When `getNextPageParam` is provided, `initialPageParam` is required. This
 * mirrors TanStack's own API and ensures `TPageParam` is inferred from the
 * concrete initial value (so `ctx.pageParam` in `queryFn` is typed correctly).
 */
export type QueryFactoryConfig<
	TParams = void,
	TData = unknown,
	TError = Error,
	TSelected = TData,
	TPageParam = unknown,
	TCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
> = StandardQueryOptions<TError, TData> & {
	/** Namespace segments. Params are appended as the final element at call time,
	 *  giving a full key of [...namespace, 'infinite'?, params, crawlOptions?]. */
	queryKey: QueryKey;
	queryFn?: (
		params: TParams,
		context: QueryFunctionContext<
			QueryKey,
			[unknown] extends [TPageParam] ? never : TPageParam
		>,
	) => TData | Promise<TData>;
	select?: (data: TData) => TSelected;
} & (
		| {
				/** TanStack v5 generic order: GetNextPageParamFunction<TPageParam, TData> */
				getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
				/** Required alongside getNextPageParam — drives TPageParam inference so
				 *  ctx.pageParam in queryFn is typed as TPageParam, not unknown. */
				initialPageParam: TPageParam;
				getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TData>;
				/** Reduces crawled pages incrementally into the final query result.
				 *  Called once per page; accumulator is undefined on the first call.
				 *  When set, enables crawling on both the regular and .infinite variants. */
				reduce?: (accumulator: TSelected | undefined, page: TData) => TSelected;
				/** Called after each page to decide whether to keep crawling.
				 *  `combined` may be undefined when reduce is absent. */
				shouldFetchNextPage?: (
					combined: TSelected | undefined,
					crawlOptions: TCrawlOptions,
				) => boolean;
		  }
		| {
				getNextPageParam?: never;
				initialPageParam?: never;
				getPreviousPageParam?: never;
				shouldFetchNextPage?: never;
				reduce?: never;
		  }
	);

/**
 * What `factory(params)` returns — pass directly to `useQuery()`.
 *
 * The `initialPageParam?: never` field is a structural guard that makes this
 * type incompatible with `useInfiniteQuery`, preventing accidental misuse.
 */
export type ResolvedQueryOptions<
	TData = unknown,
	TError = Error,
	TSelected = TData,
> = StandardQueryOptions<TError, TData> & {
	queryKey: QueryKey;
	queryFn?: (context: QueryFunctionContext) => TData | Promise<TData>;
	select?: (data: TData) => TSelected;
	/** Structural guard: makes this type incompatible with useInfiniteQuery, which requires initialPageParam. */
	initialPageParam?: never;
};

/**
 * What `factory.infinite(params)` returns — pass directly to `useInfiniteQuery()`.
 *
 * The `select` field expects `InfiniteData<TData, TPageParam>`, which is a structural
 * guard making this type incompatible with `useQuery`.
 */
export type ResolvedInfiniteOptions<
	TData = unknown,
	TError = Error,
	TPageParam = unknown,
> = Omit<StandardQueryOptions<TError, any>, 'persister'> & {
	queryKey: QueryKey;
	queryFn?: (
		context: QueryFunctionContext<QueryKey, TPageParam>,
	) => TData | Promise<TData>;
	/** Structural guard: the InfiniteData parameter type makes this incompatible with useQuery,
	 *  whose select expects (data: TData) rather than (data: InfiniteData<TData, TPageParam>). */
	select?: (data: InfiniteData<TData, TPageParam>) => any;
	/** Required so this type satisfies useInfiniteQuery, which requires getNextPageParam. */
	getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
	getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TData>;
	/** Required so this type satisfies useInfiniteQuery, which requires initialPageParam. */
	initialPageParam: TPageParam;
};

/**
 * A callable factory produced by `queryFactory()`.
 *
 * - `factory(params)` → `ResolvedQueryOptions` for `useQuery()`
 * - `factory.infinite(params)` → `ResolvedInfiniteOptions` for `useInfiniteQuery()`
 *
 * Both signatures accept an optional `crawlOptions` object that is appended to
 * the query key and passed to `shouldFetchNextPage` so different call sites can
 * control crawl behavior independently.
 *
 * `params` is always optional. Calling with no arguments produces just the
 * namespace key, which is useful for broad cache invalidation:
 * `queryClient.invalidateQueries(factory())`
 */
export interface QueryFactory<
	TParams = void,
	TData = unknown,
	TError = Error,
	TSelected = TData,
	TPageParam = unknown,
	TCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
> {
	(
		params?: TParams,
		crawlOptions?: TCrawlOptions,
	): ResolvedQueryOptions<TData, TError, TSelected>;
	infinite(
		params?: TParams,
		crawlOptions?: TCrawlOptions,
	): ResolvedInfiniteOptions<TData, TError, TPageParam>;
}

// ─── Internal ────────────────────────────────────────────────────────────────

const FACTORY_CONFIG = Symbol('factoryConfig');

interface NormalizedConfig {
	queryKey: QueryKey;
	queryFn?: (params: any, ctx: QueryFunctionContext<any, any>) => any;
	select?: (data: any) => any;
	getNextPageParam?: GetNextPageParamFunction<any, any>;
	getPreviousPageParam?: GetPreviousPageParamFunction<any, any>;
	initialPageParam?: any;
	shouldFetchNextPage?: (
		combined: any,
		crawlOptions: Record<string, unknown>,
	) => boolean;
	reduce?: (accumulator: any, page: any) => any;
	standardOptions: StandardQueryOptions<any, any>;
}

/** Opaque envelope returned by the infinite crawling queryFn to TanStack. */
interface CrawlEnvelope<TSelected, TPageParam> {
	data: TSelected;
	nextPageParam: TPageParam | null | undefined;
}

const getEnvelopeNextPageParam = (envelope: CrawlEnvelope<any, any>) =>
	envelope.nextPageParam;

const noNextPage = () => undefined;

/** Appends params and any crawl options to the key. */
function resolveKey(
	namespace: QueryKey,
	params: unknown,
	crawlOptions?: Record<string, unknown>,
): QueryKey {
	const base = Array.isArray(namespace) ? namespace : [namespace];
	const withParams = params === undefined ? base : [...base, params];
	if (!crawlOptions) return withParams;
	let defined: Record<string, unknown> | undefined;
	for (const key in crawlOptions) {
		if (crawlOptions[key] !== undefined) {
			(defined ??= {})[key] = crawlOptions[key];
		}
	}
	return defined ? [...withParams, defined] : withParams;
}

function wrapGetNextPageParam<TData, TPageParam, TSelected>(
	getNextPageParam: GetNextPageParamFunction<TPageParam, TData>,
	shouldFetchNextPage: (
		combined: TSelected | undefined,
		crawlOptions: Record<string, unknown>,
	) => boolean,
	crawlOptions: Record<string, unknown>,
): GetNextPageParamFunction<TPageParam, TData> {
	return (lastPage, allPages, lastPageParam, allPageParams) => {
		if (!shouldFetchNextPage(lastPage as unknown as TSelected, crawlOptions))
			return undefined;
		return getNextPageParam(lastPage, allPages, lastPageParam, allPageParams);
	};
}

/** Crawling queryFn for regular useQuery — collects all pages into a combined result. */
function buildCrawlingQueryFn<TData, TPageParam, TSelected>(
	queryFn: (
		params: any,
		ctx: QueryFunctionContext<any, any>,
	) => TData | Promise<TData>,
	getNextPageParam: GetNextPageParamFunction<TPageParam, TData>,
	initialPageParam: TPageParam,
	shouldFetchNextPage:
		| ((
				combined: TSelected | undefined,
				crawlOptions: Record<string, unknown>,
		  ) => boolean)
		| undefined,
	reduce:
		| ((accumulator: TSelected | undefined, page: TData) => TSelected)
		| undefined,
): (
	params: any,
	crawlOptions: Record<string, unknown>,
	ctx: QueryFunctionContext,
) => Promise<TSelected | TData[]> {
	return async (params, crawlOptions, context) => {
		const pages: TData[] = [];
		const pageParams: TPageParam[] = [];
		let currentParam: TPageParam = initialPageParam;
		let acc: TSelected | undefined = undefined;
		const ctx = { ...context, pageParam: currentParam as unknown };

		while (true) {
			if (context.signal?.aborted) break;

			ctx.pageParam = currentParam;
			const page = await queryFn(params, ctx as any);
			pages.push(page);
			pageParams.push(currentParam);
			if (reduce) acc = reduce(acc, page);

			if (context.signal?.aborted) break;

			if (shouldFetchNextPage && !shouldFetchNextPage(acc, crawlOptions)) break;

			const nextParam = getNextPageParam(page, pages, currentParam, pageParams);
			if (nextParam == null) break;

			currentParam = nextParam as TPageParam;
		}

		if (reduce) {
			if (acc === undefined) throw new DOMException('Aborted', 'AbortError');
			return acc;
		}
		return pages;
	};
}

/** Crawling queryFn for useInfiniteQuery — each virtual page is one crawl.
 *
 *  Starts from ctx.pageParam (provided by TanStack), crawls until
 *  shouldFetchNextPage returns false or getNextPageParam returns null, then
 *  returns an envelope containing the combined result and the next batch's
 *  starting param. TanStack's getNextPageParam is wired to read that field. */
function buildInfiniteCrawlingQueryFn<TData, TPageParam, TSelected>(
	queryFn: (
		params: any,
		ctx: QueryFunctionContext<any, any>,
	) => TData | Promise<TData>,
	getNextPageParam: GetNextPageParamFunction<TPageParam, TData>,
	shouldFetchNextPage:
		| ((
				combined: TSelected | undefined,
				crawlOptions: Record<string, unknown>,
		  ) => boolean)
		| undefined,
	reduce: (accumulator: TSelected | undefined, page: TData) => TSelected,
): (
	params: any,
	crawlOptions: Record<string, unknown>,
	ctx: QueryFunctionContext<any, TPageParam>,
) => Promise<CrawlEnvelope<TSelected, TPageParam>> {
	return async (params, crawlOptions, context) => {
		const pages: TData[] = [];
		const pageParams: TPageParam[] = [];
		let currentParam = context.pageParam as TPageParam;
		let acc: TSelected | undefined = undefined;
		let nextBatchParam: TPageParam | null | undefined = null;
		const ctx = { ...context, pageParam: currentParam as unknown };

		while (true) {
			if (context.signal?.aborted) break;

			ctx.pageParam = currentParam;
			const page = await queryFn(params, ctx as any);
			pages.push(page);
			pageParams.push(currentParam);
			acc = reduce(acc, page);

			if (context.signal?.aborted) break;

			// Capture next-batch starting point before deciding to stop.
			const nextParam = getNextPageParam(page, pages, currentParam, pageParams);
			nextBatchParam = nextParam ?? null;

			if (nextParam == null) break;
			if (shouldFetchNextPage && !shouldFetchNextPage(acc, crawlOptions)) break;

			currentParam = nextParam as TPageParam;
		}

		if (acc === undefined) throw new DOMException('Aborted', 'AbortError');
		return { data: acc, nextPageParam: nextBatchParam };
	};
}

function buildFactory(
	cfg: NormalizedConfig,
): QueryFactory<any, any, any, any, any, any> {
	const {
		queryKey: namespace,
		queryFn: rawQueryFn,
		select,
		getNextPageParam,
		getPreviousPageParam,
		initialPageParam,
		shouldFetchNextPage,
		reduce,
		standardOptions,
	} = cfg;

	const hasCrawling =
		rawQueryFn !== undefined && getNextPageParam !== undefined;

	const hasInfiniteCrawling = hasCrawling && reduce !== undefined;

	const crawlingFn = hasCrawling
		? buildCrawlingQueryFn(
				rawQueryFn,
				getNextPageParam,
				initialPageParam,
				shouldFetchNextPage,
				reduce,
			)
		: undefined;

	const infiniteCrawlingFn = hasInfiniteCrawling
		? buildInfiniteCrawlingQueryFn(
				rawQueryFn,
				getNextPageParam!,
				shouldFetchNextPage,
				reduce,
			)
		: undefined;

	const infiniteNamespace = [...resolveKey(namespace, undefined), 'infinite'];

	const envelopeSelect = infiniteCrawlingFn
		? (data: { pages: CrawlEnvelope<any, any>[]; pageParams: any[] }) => ({
				...data,
				pages: data.pages.map(e => (select ? select(e.data) : e.data)),
			})
		: undefined;

	const infiniteSelect =
		!infiniteCrawlingFn && select
			? (data: { pages: unknown[]; pageParams: unknown[] }) => ({
					...data,
					pages: data.pages.map(select),
				})
			: undefined;

	const factory = function (
		params: any,
		crawlOptions: Record<string, unknown> = {},
	) {
		const queryKey = resolveKey(namespace, params, crawlOptions);

		const resolvedQueryFn = crawlingFn
			? (ctx: QueryFunctionContext) => crawlingFn(params, crawlOptions, ctx)
			: rawQueryFn
				? (ctx: QueryFunctionContext<any, any>) => rawQueryFn(params, ctx)
				: undefined;

		return {
			...standardOptions,
			queryKey,
			...(resolvedQueryFn !== undefined && { queryFn: resolvedQueryFn }),
			...(select !== undefined && { select }),
			[FACTORY_CONFIG]: cfg,
		};
	} as unknown as QueryFactory<any, any, any, any, any, any>;

	factory.infinite = function (
		params: any,
		crawlOptions: Record<string, unknown> = {},
	) {
		// 'infinite' sits between the namespace and the params so the key reads as
		// [...namespace, 'infinite', params, crawlOptions?] — the variant marker precedes the args.
		const queryKey = resolveKey(infiniteNamespace, params, crawlOptions);

		if (infiniteCrawlingFn) {
			// Each virtual page is a crawl. The envelope carries nextBatchParam so
			// TanStack knows where the next virtual page starts.
			return {
				...standardOptions,
				queryKey,
				queryFn: (ctx: QueryFunctionContext<any, any>) =>
					infiniteCrawlingFn(params, crawlOptions, ctx),
				getNextPageParam: getEnvelopeNextPageParam,
				initialPageParam,
				select: envelopeSelect,
				...(getPreviousPageParam !== undefined && { getPreviousPageParam }),
				[FACTORY_CONFIG]: cfg,
			} as ResolvedInfiniteOptions<any, any, any>;
		}

		const boundQueryFn = rawQueryFn
			? (ctx: QueryFunctionContext<any, any>) => rawQueryFn(params, ctx)
			: undefined;

		// Non-crawling infinite: single API call per virtual page (original behaviour).
		// Always provide getNextPageParam; fall back to () => undefined (no next page) if absent.
		const infiniteGetNextPageParam =
			getNextPageParam && shouldFetchNextPage
				? wrapGetNextPageParam(
						getNextPageParam,
						shouldFetchNextPage,
						crawlOptions,
					)
				: (getNextPageParam ?? noNextPage);

		return {
			...standardOptions,
			queryKey,
			...(boundQueryFn !== undefined && { queryFn: boundQueryFn }),
			...(infiniteSelect !== undefined && { select: infiniteSelect }),
			getNextPageParam: infiniteGetNextPageParam,
			...(getPreviousPageParam !== undefined && { getPreviousPageParam }),
			...(initialPageParam !== undefined && { initialPageParam }),
			[FACTORY_CONFIG]: cfg,
		} as ResolvedInfiniteOptions<any, any, any>;
	};

	return factory;
}

// ─── Overloads ───────────────────────────────────────────────────────────────

/**
 * Creates a standalone query factory with pagination and reduce. When `reduce` is
 * present, `shouldFetchNextPage` receives `TSelected` (never undefined) because
 * reduce always runs before the crawl-stop check.
 */
export function queryFactory<
	TParams = void,
	TData = unknown,
	TError = Error,
	TSelected = TData,
	TPageParam = unknown,
	TCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
>(
	config: StandardQueryOptions<TError, TData> & {
		queryKey: QueryKey;
		queryFn?: (
			params: TParams,
			context: QueryFunctionContext<
				QueryKey,
				[unknown] extends [TPageParam] ? never : TPageParam
			>,
		) => TData | Promise<TData>;
		select?: (data: TData) => TSelected;
		getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
		initialPageParam: TPageParam;
		getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TData>;
		reduce: (accumulator: TSelected | undefined, page: TData) => TSelected;
		shouldFetchNextPage?: (
			combined: TSelected,
			crawlOptions: TCrawlOptions,
		) => boolean;
	},
): QueryFactory<TParams, TData, TError, TSelected, TPageParam, TCrawlOptions>;

/**
 * Creates a standalone query factory from a config object.
 *
 * @example
 * const usersFactory = queryFactory({
 *   queryKey: ['users'],
 *   queryFn: (params: { page: number }, ctx) => fetchUsers(params, ctx.signal),
 * });
 * // useQuery(usersFactory({ page: 1 }))
 */
export function queryFactory<
	TParams = void,
	TData = unknown,
	TError = Error,
	TSelected = TData,
	TPageParam = unknown,
	TCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
>(
	config: QueryFactoryConfig<
		TParams,
		TData,
		TError,
		TSelected,
		TPageParam,
		TCrawlOptions
	>,
): QueryFactory<TParams, TData, TError, TSelected, TPageParam, TCrawlOptions>;

/**
 * Creates a child factory that inherits the query key and standard options from
 * `parent` and introduces a new `queryFn`. The child's query key is appended to
 * the parent's, and standard options are shallow-merged (child wins).
 *
 * Use this overload when the child fetches different data than the parent.
 */
export function queryFactory<
	TChildParams extends TParentParams,
	TData = unknown,
	TError = Error,
	TChildSelected = TData,
	TParentParams = TChildParams,
	TPageParam = unknown,
	TCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
>(
	parent: QueryFactory<TParentParams, any, any, any, any, any>,
	config: Omit<
		QueryFactoryConfig<
			TChildParams,
			TData,
			TError,
			TChildSelected,
			TPageParam,
			TCrawlOptions
		>,
		| 'queryKey'
		| 'getNextPageParam'
		| 'getPreviousPageParam'
		| 'initialPageParam'
		| 'shouldFetchNextPage'
		| 'reduce'
	> & {
		queryKey?: QueryKey;
		queryFn: NonNullable<
			QueryFactoryConfig<
				TChildParams,
				TData,
				TError,
				TChildSelected,
				TPageParam
			>['queryFn']
		>;
	} & (
			| {
					getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
					initialPageParam: TPageParam;
					getPreviousPageParam?: GetPreviousPageParamFunction<
						TPageParam,
						TData
					>;
					shouldFetchNextPage?: (
						combined: TChildSelected | undefined,
						crawlOptions: TCrawlOptions,
					) => boolean;
					reduce?: (
						accumulator: TChildSelected | undefined,
						page: TData,
					) => TChildSelected;
			  }
			| {
					getNextPageParam?: never;
					initialPageParam?: never;
					getPreviousPageParam?: never;
					shouldFetchNextPage?: never;
					reduce?: never;
			  }
		),
): QueryFactory<
	TChildParams,
	TData,
	TError,
	TChildSelected,
	TPageParam,
	TCrawlOptions
>;

/**
 * Creates a child factory that reuses the parent's `queryFn` and pagination
 * config. Useful for adding a `select` transform, narrowing params, or
 * overriding `shouldFetchNextPage` with a different crawl-options shape —
 * without changing what data is fetched. Parent and child `select` functions
 * are automatically composed: `child.select(parent.select(data))`.
 */
export function queryFactory<
	TChildParams extends TParentParams,
	TData = unknown,
	TError = Error,
	TParentSelected = TData,
	TChildSelected = TParentSelected,
	TParentParams = TChildParams,
	TPageParam = unknown,
	TParentCrawlOptions extends Record<string, unknown> = Record<string, unknown>,
	TChildCrawlOptions extends Record<string, unknown> = TParentCrawlOptions,
>(
	parent: QueryFactory<
		TParentParams,
		TData,
		any,
		TParentSelected,
		TPageParam,
		TParentCrawlOptions
	>,
	config: StandardQueryOptions<TError, TData> & {
		queryKey?: QueryKey;
		queryFn?: never;
		select?: (data: TParentSelected) => TChildSelected;
		getNextPageParam?: GetNextPageParamFunction<TPageParam, TData>;
		initialPageParam?: TPageParam;
		getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, TData>;
		reduce?: (
			accumulator: TChildSelected | undefined,
			page: TData,
		) => TChildSelected;
		shouldFetchNextPage?: (
			combined: TChildSelected | undefined,
			crawlOptions: TChildCrawlOptions,
		) => boolean;
	},
): QueryFactory<
	TChildParams,
	TData,
	TError,
	TChildSelected,
	TPageParam,
	TChildCrawlOptions
>;

// ─── Implementation ──────────────────────────────────────────────────────────

export function queryFactory(
	configOrParent:
		| QueryFactoryConfig<any, any, any, any, any, any>
		| QueryFactory<any, any, any, any, any, any>,
	childConfig?: Partial<QueryFactoryConfig<any, any, any, any, any, any>> & {
		queryKey?: QueryKey;
	},
): QueryFactory<any, any, any, any, any, any> {
	if (childConfig !== undefined && typeof configOrParent === 'function') {
		const result = (configOrParent as any)();
		const parentCfg = result?.[FACTORY_CONFIG] as NormalizedConfig | undefined;
		if (!parentCfg) {
			throw new Error(
				'queryFactory: first argument must be a factory created by queryFactory()',
			);
		}
		const hasNewQueryFn = childConfig.queryFn !== undefined;

		const childNamespace = childConfig.queryKey
			? Array.isArray(childConfig.queryKey)
				? childConfig.queryKey
				: [childConfig.queryKey]
			: [];
		const composedNamespace: QueryKey = [
			...parentCfg.queryKey,
			...childNamespace,
		];

		let resolvedSelect: ((data: any) => any) | undefined;
		if (hasNewQueryFn) {
			resolvedSelect = childConfig.select;
		} else if (childConfig.select && parentCfg.select) {
			const p = parentCfg.select;
			const c = childConfig.select;
			resolvedSelect = (data: any) => c(p(data));
		} else {
			resolvedSelect = childConfig.select ?? parentCfg.select;
		}

		const crawling = hasNewQueryFn
			? {
					getNextPageParam: childConfig.getNextPageParam,
					getPreviousPageParam: childConfig.getPreviousPageParam,
					initialPageParam: childConfig.initialPageParam,
					shouldFetchNextPage: childConfig.shouldFetchNextPage,
					reduce: childConfig.reduce,
				}
			: {
					getNextPageParam:
						childConfig.getNextPageParam ?? parentCfg.getNextPageParam,
					getPreviousPageParam:
						childConfig.getPreviousPageParam ?? parentCfg.getPreviousPageParam,
					initialPageParam:
						childConfig.initialPageParam !== undefined
							? childConfig.initialPageParam
							: parentCfg.initialPageParam,
					shouldFetchNextPage:
						childConfig.shouldFetchNextPage ?? parentCfg.shouldFetchNextPage,
					reduce: childConfig.reduce ?? parentCfg.reduce,
				};

		const {
			queryKey: _k,
			queryFn: _f,
			select: _s,
			getNextPageParam: _g,
			getPreviousPageParam: _gp,
			initialPageParam: _ip,
			shouldFetchNextPage: _sfnp,
			reduce: _c,
			...childStandardOptions
		} = childConfig;

		return buildFactory({
			queryKey: composedNamespace,
			queryFn: hasNewQueryFn ? childConfig.queryFn : parentCfg.queryFn,
			select: resolvedSelect,
			...crawling,
			standardOptions: {
				...parentCfg.standardOptions,
				...childStandardOptions,
			},
		});
	}

	const {
		queryKey,
		queryFn,
		select,
		getNextPageParam,
		getPreviousPageParam,
		initialPageParam,
		shouldFetchNextPage,
		reduce,
		...standardOptions
	} = configOrParent as QueryFactoryConfig<any, any, any, any, any, any>;

	return buildFactory({
		queryKey,
		queryFn,
		select,
		getNextPageParam,
		getPreviousPageParam,
		initialPageParam,
		shouldFetchNextPage,
		reduce,
		standardOptions,
	});
}
