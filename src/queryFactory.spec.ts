import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import type {
  UseQueryOptions,
  UseInfiniteQueryOptions,
  InfiniteData,
  QueryKey,
} from '@tanstack/react-query';
import { queryFactory } from './queryFactory.js';
import type {
  ResolvedQueryOptions,
  ResolvedInfiniteOptions,
} from './queryFactory.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type User = { id: string; name: string };
type PagedUsers = { users: User[]; nextCursor: string | null };

const ctx = { signal: new AbortController().signal, meta: undefined } as any;

// ---------------------------------------------------------------------------
// Basic factory
// ---------------------------------------------------------------------------

describe('queryFactory – basic', () => {
  it('returns options with the namespace as the queryKey when params are void', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });

    expect(factory(undefined).queryKey).toEqual(['users']);
  });

  it('appends params to the namespace as the final key element', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async (params: { id: string }) =>
        ({ id: params.id, name: 'x' }) as User,
    });

    expect(factory({ id: 'u1' }).queryKey).toEqual(['users', { id: 'u1' }]);
    expect(factory({ id: 'u2' }).queryKey).toEqual(['users', { id: 'u2' }]);
  });

  it('closes params into queryFn — callers never handle the key', async () => {
    const spy = vi.fn(
      async (params: { id: string }) => ({ id: params.id, name: 'x' }) as User,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: spy,
    });

    await factory({ id: 'abc' }).queryFn!(ctx);
    expect(spy).toHaveBeenCalledWith(
      { id: 'abc' },
      expect.objectContaining({ signal: ctx.signal }),
    );
  });

  it('forwards standard options', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
      staleTime: 60_000,
      gcTime: 120_000,
      enabled: false,
    });

    const opts = factory(undefined);
    expect(opts.staleTime).toBe(60_000);
    expect(opts.gcTime).toBe(120_000);
    expect(opts.enabled).toBe(false);
  });

  it('passes select through', () => {
    const select = (users: User[]) => users.map(u => u.name);
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
      select,
    });

    expect(factory(undefined).select).toBe(select);
  });

  it('produces independent option objects per call', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { id: string }) => ({ id: p.id, name: 'x' }) as User,
    });

    const a = factory({ id: 'a' });
    const b = factory({ id: 'b' });
    expect(a.queryKey).not.toEqual(b.queryKey);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// .infinite variant
// ---------------------------------------------------------------------------

describe('queryFactory – .infinite', () => {
  it('appends "infinite" after the params element', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
    });

    expect(factory.infinite({ filter: 'active' }).queryKey).toEqual([
      'users',
      'infinite',
      { filter: 'active' },
    ]);
  });

  it('has just the namespace + "infinite" when params are void', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });

    expect(factory.infinite(undefined).queryKey).toEqual(['users', 'infinite']);
  });

  it('closes params into the infinite queryFn', async () => {
    const spy = vi.fn(
      async (params: { id: string }) => ({ id: params.id, name: 'x' }) as User,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: spy,
      getNextPageParam: () => null,
      initialPageParam: null,
    });

    await factory.infinite({ id: 'z' }).queryFn!({ ...ctx, pageParam: null });
    expect(spy).toHaveBeenCalledWith(
      { id: 'z' },
      expect.objectContaining({ pageParam: null }),
    );
  });

  it('exposes getNextPageParam and initialPageParam', () => {
    const gnp = (p: PagedUsers) => p.nextCursor;
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: gnp,
      initialPageParam: null as string | null,
    });

    const opts = factory.infinite(undefined);
    expect(opts.getNextPageParam).toBe(gnp);
    expect(opts.initialPageParam).toBeNull();
  });

  it('wraps getNextPageParam with shouldFetchNextPage', () => {
    const gnp = vi.fn((_p: PagedUsers) => 'next');
    const sfnp = vi.fn(
      (_combined: PagedUsers | undefined, _opts: Record<string, unknown>) =>
        false,
    );

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: 'next' }) as PagedUsers,
      getNextPageParam: gnp,
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    const page: PagedUsers = { users: [], nextCursor: 'c' };
    factory.infinite(undefined).getNextPageParam!(page, [page], null, [null]);

    expect(sfnp).toHaveBeenCalled();
    expect(gnp).not.toHaveBeenCalled();
  });

  it('when shouldFetchNextPage returns true, getNextPageParam is called and its return value is used', () => {
    const gnp = vi.fn((_p: PagedUsers) => 'next-cursor');
    const sfnp = vi.fn(() => true);

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({ users: [], nextCursor: 'next-cursor' }) as PagedUsers,
      getNextPageParam: gnp,
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    const page: PagedUsers = { users: [], nextCursor: 'next-cursor' };
    const result = factory.infinite(undefined).getNextPageParam!(
      page,
      [page],
      null,
      [null],
    );

    expect(sfnp).toHaveBeenCalled();
    expect(gnp).toHaveBeenCalled();
    expect(result).toBe('next-cursor');
  });

  it('passes getPreviousPageParam through to infinite options', () => {
    const gpp = vi.fn();
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      getPreviousPageParam: gpp,
      initialPageParam: null as string | null,
    });

    expect(factory.infinite(undefined).getPreviousPageParam).toBe(gpp);
  });

  it('wraps per-page select into InfiniteData', () => {
    const select = (p: PagedUsers) => p.users;
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      select,
    });

    const infiniteSelect = factory.infinite(undefined).select!;
    const p1: PagedUsers = {
      users: [{ id: '1', name: 'Alice' }],
      nextCursor: null,
    };
    const p2: PagedUsers = {
      users: [{ id: '2', name: 'Bob' }],
      nextCursor: null,
    };

    expect(
      infiniteSelect({ pages: [p1, p2], pageParams: [null, 'p2'] }),
    ).toEqual({
      pages: [[{ id: '1', name: 'Alice' }], [{ id: '2', name: 'Bob' }]],
      pageParams: [null, 'p2'],
    });
  });

  it('has no infinite select when no select is configured', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });
    expect(factory.infinite(undefined).select).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Crawling queryFn
// ---------------------------------------------------------------------------

describe('queryFactory – crawling', () => {
  it('auto-paginates through all pages when shouldFetchNextPage always returns true', async () => {
    let call = 0;
    const pages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'p2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: null },
    ];
    const pageFn = vi.fn(async (_params: void, _ctx: any) => pages[call++]!);

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual(pages);
  });

  it('pageParam flows through ctx into the user queryFn', async () => {
    const pageFn = vi.fn(
      async (_p: void, _ctx: any) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => false,
      initialPageParam: 'start' as string | null,
      reduce: (acc, page): PagedUsers[] => [...(acc ?? []), page],
    });

    await factory(undefined).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ pageParam: 'start' }),
    );
  });

  it('applies reduce as a reducer across pages', async () => {
    const page: PagedUsers = {
      users: [{ id: '1', name: 'Alice' }],
      nextCursor: null,
    };
    const reduce = vi.fn((acc: User[] | undefined, p: PagedUsers): User[] => [
      ...(acc ?? []),
      ...p.users,
    ]);

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => page,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce,
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(reduce).toHaveBeenCalledWith(undefined, page);
    expect(result).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('stops when shouldFetchNextPage returns false', async () => {
    let call = 0;
    const cursors = ['p2', 'p3', null];
    const pageFn = vi.fn(
      async () =>
        ({ users: [], nextCursor: cursors[call++] ?? null }) as PagedUsers,
    );

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      reduce: (acc, page): PagedUsers[] => [...(acc ?? []), page],
      shouldFetchNextPage: combined => (combined?.length ?? 0) < 2,
      initialPageParam: null as string | null,
    });

    await factory(undefined).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when signal is already aborted before any page is fetched', async () => {
    const controller = new AbortController();
    controller.abort();

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    await expect(
      factory(undefined).queryFn!({
        signal: controller.signal,
        meta: undefined,
      } as any),
    ).rejects.toThrow('Aborted');
  });

  it('returns [] when signal is pre-aborted and no reduce is configured', async () => {
    const controller = new AbortController();
    controller.abort();

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      // no reduce
    });

    const result = await factory(undefined).queryFn!({
      signal: controller.signal,
      meta: undefined,
    } as any);
    expect(result).toEqual([]);
  });

  it('returns empty result when the only page has no data', async () => {
    const pageFn = vi.fn(
      async () => ({ users: [], nextCursor: null }) as PagedUsers,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('returns partial accumulated results when signal aborts between pages', async () => {
    const controller = new AbortController();
    let call = 0;

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => {
        const page = {
          users: [{ id: String(call + 1), name: `u${call + 1}` }],
          nextCursor: 'next',
        } as PagedUsers;
        if (call++ === 0) controller.abort();
        return page;
      },
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    const result = await factory(undefined).queryFn!({
      signal: controller.signal,
      meta: undefined,
    } as any);
    expect(result).toEqual([{ id: '1', name: 'u1' }]);
  });

  it('propagates queryFn errors thrown on the first page', async () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => {
        throw new Error('network error');
      },
      getNextPageParam: (p: PagedUsers) => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    await expect(factory(undefined).queryFn!(ctx)).rejects.toThrow(
      'network error',
    );
  });

  it('propagates queryFn errors thrown mid-crawl', async () => {
    let call = 0;
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => {
        if (call++ === 1) throw new Error('page 2 failed');
        return {
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: 'p2',
        } as PagedUsers;
      },
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    await expect(factory(undefined).queryFn!(ctx)).rejects.toThrow(
      'page 2 failed',
    );
  });

  it('shouldFetchNextPage receives undefined as combined when reduce is absent', async () => {
    const sfnp = vi.fn(() => false);
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: 'next',
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    await factory(undefined).queryFn!(ctx);
    expect(sfnp).toHaveBeenCalledWith(undefined, {});
  });

  it('infinite variant uses the raw single-page queryFn, not the crawling wrapper', async () => {
    let calls = 0;
    const pageFn = vi.fn(async () => {
      calls++;
      return { users: [], nextCursor: null } as PagedUsers;
    });

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: () => null,
      shouldFetchNextPage: () => false,
      initialPageParam: null,
    });

    await factory.infinite(undefined).queryFn!({ ...ctx, pageParam: null });
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Async iterable queryFn (e.g. AWS SDK v3 paginators)
// ---------------------------------------------------------------------------

async function* makePages(pages: PagedUsers[]): AsyncIterable<PagedUsers> {
  for (const page of pages) yield page;
}

describe('queryFactory – async iterable queryFn', () => {
  it('crawls all yielded pages and accumulates via reduce', async () => {
    const allPages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'c2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: null },
    ];
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () => makePages(allPages),
      shouldFetchNextPage: () => true,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(result).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('stops early when shouldFetchNextPage returns false', async () => {
    async function* infinitePages(): AsyncIterable<PagedUsers> {
      let i = 0;
      while (true)
        yield {
          users: [{ id: String(++i), name: `u${i}` }],
          nextCursor: `c${i}`,
        };
    }
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () => infinitePages(),
      shouldFetchNextPage: (users: User[] | undefined) =>
        (users?.length ?? 0) < 2,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(result).toHaveLength(2);
  });

  it('getNextPageParam is not required — iterator manages its own cursor', async () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () =>
        makePages([{ users: [{ id: '1', name: 'Alice' }], nextCursor: null }]),
      shouldFetchNextPage: () => false,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    expect(factory(undefined).queryFn).toBeDefined();
    const result = await factory(undefined).queryFn!(ctx);
    expect(result).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('ctx.pageParam is available for passing startingToken to a paginator', async () => {
    const receivedPageParams: unknown[] = [];
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: (_params, ctx) => {
        receivedPageParams.push(ctx.pageParam);
        return makePages([{ users: [], nextCursor: null }]);
      },
      shouldFetchNextPage: () => false,
      initialPageParam: 'myToken' as string | undefined,
      reduce: (acc): User[] => acc ?? [],
    });

    await factory(undefined).queryFn!(ctx);
    expect(receivedPageParams[0]).toBe('myToken');
  });

  it('throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () =>
        makePages([{ users: [{ id: '1', name: 'Alice' }], nextCursor: null }]),
      shouldFetchNextPage: () => true,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    await expect(
      factory(undefined).queryFn!({
        signal: controller.signal,
        meta: undefined,
      } as any),
    ).rejects.toThrow('Aborted');
  });

  it('returns partial results when signal aborts mid-iteration', async () => {
    const controller = new AbortController();
    let count = 0;
    async function* pages(): AsyncIterable<PagedUsers> {
      while (true) {
        yield {
          users: [{ id: String(++count), name: `u${count}` }],
          nextCursor: 'next',
        };
        if (count === 1) controller.abort();
      }
    }
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () => pages(),
      shouldFetchNextPage: () => true,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    const result = await factory(undefined).queryFn!({
      signal: controller.signal,
      meta: undefined,
    } as any);
    expect(result).toEqual([{ id: '1', name: 'u1' }]);
  });

  it('returns raw pages array when reduce is absent', async () => {
    const allPages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'c2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: null },
    ];
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: () => makePages(allPages),
      shouldFetchNextPage: () => true,
      // no reduce — result is TData[]
    });

    const result = await factory(undefined).queryFn!(ctx);
    expect(result).toEqual(allPages);
  });

  it('.infinite() works with async iterable — ctx.pageParam as startingToken', async () => {
    const startingTokens: unknown[] = [];
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: (_params, ctx) => {
        startingTokens.push(ctx.pageParam);
        return makePages([
          { users: [{ id: '1', name: 'Alice' }], nextCursor: 'next' },
        ]);
      },
      getNextPageParam: (p: PagedUsers) => p.nextCursor,
      initialPageParam: null as string | null,
      shouldFetchNextPage: () => false,
      reduce: (acc: User[] | undefined, p: PagedUsers): User[] => [
        ...(acc ?? []),
        ...p.users,
      ],
    });

    const envelope = await factory.infinite(undefined).queryFn!({
      ...ctx,
      pageParam: 'token-abc',
    });
    expect(startingTokens[0]).toBe('token-abc');
    expect((envelope as any).data).toEqual([{ id: '1', name: 'Alice' }]);
    expect((envelope as any).nextPageParam).toBe('next');
  });
});

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe('queryFactory – composition', () => {
  const base = queryFactory({
    queryKey: ['users'],
    queryFn: async (p: { filter: string }) => [] as User[],
  });

  it('inserts params before child segments: [...parentNS, params, ...childSegs]', () => {
    const child = queryFactory(base, { queryKey: ['active'] });
    expect(child({ filter: 'admin' }).queryKey).toEqual([
      'users',
      { filter: 'admin' },
      'active',
    ]);
  });

  it('inserts params before child segments on .infinite: [...parentNS, params, ...childSegs, "infinite"]', () => {
    const child = queryFactory(base, { queryKey: ['active'] });
    expect(child.infinite({ filter: 'admin' }).queryKey).toEqual([
      'users',
      { filter: 'admin' },
      'active',
      'infinite',
    ]);
  });

  it('zero-arg returns just the parent namespace for broad invalidation', () => {
    const child = queryFactory(base, { queryKey: ['active'] });
    expect(child().queryKey).toEqual(['users']);
    expect(child.infinite().queryKey).toEqual(['users']);
  });

  it('parent(params) key is a prefix of child(params) key — enables per-instance invalidation', () => {
    const child = queryFactory(base, { queryKey: ['active'] });
    const parentKey = base({ filter: 'admin' }).queryKey as unknown[];
    const childKey = child({ filter: 'admin' }).queryKey as unknown[];
    expect(childKey.slice(0, parentKey.length)).toEqual(parentKey);
  });

  it('uses only the parent namespace when no child queryKey is given', () => {
    const child = queryFactory(base, {});
    expect(child({ filter: 'x' }).queryKey).toEqual(['users', { filter: 'x' }]);
  });

  it('inherits parent queryFn when child provides none', async () => {
    const spy = vi.fn(async (p: { filter: string }) => [] as User[]);
    const parent = queryFactory({ queryKey: ['users'], queryFn: spy });
    const child = queryFactory(parent, { queryKey: ['active'] });

    await child({ filter: 'x' }).queryFn!(ctx);
    expect(spy).toHaveBeenCalledWith({ filter: 'x' }, expect.anything());
  });

  it('replaces queryFn when child provides one', async () => {
    const parentFn = vi.fn(async (_p: { filter: string }) => [] as User[]);
    const childFn = vi.fn(async (p: { filter: string }) => [] as User[]);
    const parent = queryFactory({ queryKey: ['users'], queryFn: parentFn });
    const child = queryFactory(parent, {
      queryKey: ['mine'],
      queryFn: childFn,
    });

    await child({ filter: 'x' }).queryFn!(ctx);
    expect(childFn).toHaveBeenCalled();
    expect(parentFn).not.toHaveBeenCalled();
  });

  it('composes select when child adds one without a new queryFn', () => {
    const parentSelect = (users: User[]) => users.map(u => u.id);
    const childSelect = (ids: string[]) => ids.length;

    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
      select: parentSelect,
    });
    const child = queryFactory(parent, { select: childSelect });

    const users: User[] = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    expect(child({ filter: 'x' }).select!(users)).toBe(2);
  });

  it('does NOT compose select when child provides a new queryFn', () => {
    const parentSelect = (users: User[]) => users.map(u => u.id);
    const childSelect = vi.fn((data: User[]) => data);

    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
      select: parentSelect,
    });
    const child = queryFactory(parent, {
      queryFn: async (p: { filter: string }) => [] as User[],
      select: childSelect,
    });

    child({ filter: 'x' }).select!([] as User[]);
    expect(childSelect).toHaveBeenCalled();
  });

  it('inherits parent select when child adds neither queryFn nor select', () => {
    const parentSelect = (users: User[]) => users.map(u => u.id);
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
      select: parentSelect,
    });
    const child = queryFactory(parent, { queryKey: ['active'] });

    expect(child({ filter: 'x' }).select).toBe(parentSelect);
  });

  it('drops parent select when child provides new queryFn with no select', () => {
    const parentSelect = (users: User[]) => users.map(u => u.id);
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
      select: parentSelect,
    });
    const child = queryFactory(parent, {
      queryFn: async (p: { filter: string }) => [] as User[],
    });

    expect(child({ filter: 'x' }).select).toBeUndefined();
  });

  it('child with new queryFn can bring its own crawling config', async () => {
    let call = 0;
    const pages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'p2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: null },
    ];
    const childFn = vi.fn(async (_p: void, _ctx: any) => pages[call++]!);
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });
    const child = queryFactory(parent, {
      queryFn: childFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
    });

    await child(undefined).queryFn!(ctx);
    expect(childFn).toHaveBeenCalledTimes(2);
  });

  it('child with new queryFn: getNextPageParam without initialPageParam is valid', () => {
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });
    queryFactory(parent, {
      queryFn: async () => [] as User[],
      getNextPageParam: () => null,
    });
  });

  it('does not inherit getNextPageParam/initialPageParam when child provides a new queryFn', () => {
    const gnp = vi.fn() as any;
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (_p: { filter: string }) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: gnp,
      initialPageParam: null,
    });
    const child = queryFactory(parent, {
      queryFn: async (_p: { filter: string }) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
    });

    // getNextPageParam is always set; with no crawling config the fallback returns undefined
    // (meaning "no next page"), which satisfies useInfiniteQuery's required field.
    const childGnp = child.infinite({ filter: 'x' }).getNextPageParam;
    expect(typeof childGnp).toBe('function');
    expect(childGnp({} as any, [], null as any, [])).toBeUndefined();
    expect(child.infinite({ filter: 'x' }).initialPageParam).toBeUndefined();
  });

  it('inherits shouldFetchNextPage and reduce from parent when child provides a new queryFn but omits them', async () => {
    let call = 0;
    const pages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'p2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: null },
    ];
    const pageFn = vi.fn(async (_p: void, _ctx: any) => pages[call++]!);

    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: () => true,
    });

    const child = queryFactory(parent, {
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      // shouldFetchNextPage and reduce intentionally omitted — inherited from parent
    });

    const result = await child(undefined).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledTimes(2);
    // parent's reduce flattens pages into User[]
    expect(result).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('inherits crawling options when child provides no new queryFn', () => {
    const gnp = vi.fn() as any;
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (_p: { filter: string }) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: gnp,
      initialPageParam: null,
    });
    const child = queryFactory(parent, { queryKey: ['scoped'] });

    expect(child.infinite({ filter: 'x' }).getNextPageParam).toBe(gnp);
    expect(child.infinite({ filter: 'x' }).initialPageParam).toBeNull();
  });

  it('child without queryFn can override shouldFetchNextPage with a different TCrawlOptions', async () => {
    let call = 0;
    const ids = ['u1', 'u2', 'u3'];
    const pageFn = vi.fn(
      async () =>
        ({
          users: [{ id: ids[call] ?? 'u?', name: `user-${call}` }],
          nextCursor: ++call < ids.length ? `c${call}` : null,
        }) as PagedUsers,
    );

    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: (_users, opts: { minResults?: number }) =>
        (opts.minResults ?? 0) > 0,
    });

    const child = queryFactory(parent, {
      queryKey: ['find'],
      shouldFetchNextPage: (users, opts: { targetId?: string }) =>
        opts.targetId != null && !users?.some(u => u.id === opts.targetId),
    });

    // target is in the second page → should stop after 2 API calls
    await child(undefined, { targetId: 'u2' }).queryFn!(ctx);
    expect(pageFn).toHaveBeenCalledTimes(2);
  });

  it('throws when first argument is a function but not a queryFactory result', () => {
    expect(() => queryFactory((() => ({})) as any, {})).toThrow(
      'queryFactory: first argument must be a factory created by queryFactory()',
    );
  });

  it('wraps a plain-string child queryKey into an array segment', () => {
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (p: { filter: string }) => [] as User[],
    });
    const child = queryFactory(parent, {
      queryKey: 'active' as unknown as QueryKey,
    });
    expect(child({ filter: 'x' }).queryKey).toEqual([
      'users',
      { filter: 'x' },
      'active',
    ]);
  });

  it('child without queryFn can override initialPageParam', () => {
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async (_p: { filter: string }) => [] as User[],
      getNextPageParam: () => null,
      initialPageParam: null as string | null,
    });
    const child = queryFactory(parent, {
      queryKey: ['scoped'],
      initialPageParam: 'custom-start' as string | null,
    });
    expect(child.infinite({ filter: 'x' }).initialPageParam).toBe(
      'custom-start',
    );
  });

  it('supports deep composition (grandchild)', () => {
    const a = queryFactory({
      queryKey: ['a'],
      queryFn: async (p: { x: string }) => [] as User[],
    });
    const b = queryFactory(a, { queryKey: ['b'] });
    const c = queryFactory(b, { queryKey: ['c'] });

    expect(c({ x: '1' }).queryKey).toEqual(['a', 'b', { x: '1' }, 'c']);
    expect(c.infinite({ x: '1' }).queryKey).toEqual([
      'a',
      'b',
      { x: '1' },
      'c',
      'infinite',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Record<string, unknown>
// ---------------------------------------------------------------------------

describe('queryFactory – key isolation', () => {
  it('data-affecting options are appended to the queryKey', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
      getNextPageParam: () => null,
      initialPageParam: null,
    });

    expect(factory(undefined, { minResults: 30 }).queryKey).toEqual([
      'users',
      { minResults: 30 },
    ]);
    expect(factory(undefined, { minResults: 50 }).queryKey).toEqual([
      'users',
      { minResults: 50 },
    ]);
    expect(factory(undefined).queryKey).toEqual(['users']);
  });

  it('same isolation applies to the .infinite key', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
      getNextPageParam: () => null,
      initialPageParam: null,
    });

    expect(factory.infinite(undefined, { minResults: 30 }).queryKey).toEqual([
      'users',
      'infinite',
      { minResults: 30 },
    ]);
    expect(factory.infinite(undefined).queryKey).toEqual(['users', 'infinite']);
  });

  it('crawlOptions with all-undefined values are not appended to the key', () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as User[],
    });

    expect(factory(undefined, { minResults: undefined }).queryKey).toEqual(
      factory(undefined).queryKey,
    );
    expect(
      factory.infinite(undefined, { minResults: undefined }).queryKey,
    ).toEqual(factory.infinite(undefined).queryKey);
  });
});

describe('queryFactory – Record<string, unknown>', () => {
  it('forwards crawl options to shouldFetchNextPage as the second argument', async () => {
    const sfnp = vi.fn(
      (_combined: User[] | undefined, _opts: Record<string, unknown>) => false,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: 'next',
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    const crawlOpts = { minResults: 50 };
    await factory(undefined, crawlOpts).queryFn!(ctx);

    expect(sfnp).toHaveBeenCalledWith([{ id: '1', name: 'Alice' }], crawlOpts);
  });

  it('stops the crawl when ctx.signal is aborted', async () => {
    const controller = new AbortController();
    const pageFn = vi.fn(async () => {
      controller.abort();
      return { users: [], nextCursor: 'next' } as PagedUsers;
    });
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
    });

    await factory(undefined).queryFn!({
      signal: controller.signal,
      meta: undefined,
    } as any);
    expect(pageFn).toHaveBeenCalledTimes(1);
  });

  it('passes lastPage to shouldFetchNextPage on .infinite variant (no reduce)', () => {
    const sfnp = vi.fn(
      (
        _combined: PagedUsers | undefined,
        opts: Record<string, unknown>,
      ): boolean => Object.keys(opts).length === 0,
    );
    const gnp = vi.fn((): null => null);
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: gnp,
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    const page: PagedUsers = { users: [], nextCursor: null };
    factory.infinite(undefined).getNextPageParam!(page, [page], null, [null]);

    expect(sfnp).toHaveBeenCalledWith(page, {});
  });

  it('applies select before passing to shouldFetchNextPage on .infinite variant (no reduce)', () => {
    const sfnp = vi.fn(
      (_combined: User[] | undefined, _opts: Record<string, unknown>) => false,
    );
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      select: (p: PagedUsers) => p.users,
      shouldFetchNextPage: sfnp,
      initialPageParam: null as string | null,
    });

    const page: PagedUsers = {
      users: [{ id: '1', name: 'Alice' }],
      nextCursor: null,
    };
    factory.infinite(undefined).getNextPageParam!(page, [page], null, [null]);

    expect(sfnp).toHaveBeenCalledWith([{ id: '1', name: 'Alice' }], {});
  });
});

// ---------------------------------------------------------------------------
// .infinite with crawling (reduce is set)
// ---------------------------------------------------------------------------

describe('queryFactory – .infinite crawling', () => {
  it('each virtual page crawls multiple API pages and returns the combined result', async () => {
    let call = 0;
    const apiPages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'c2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: 'c3' },
      { users: [{ id: '3', name: 'Carol' }], nextCursor: null },
    ];
    const pageFn = vi.fn(async (_p: void, _ctx: any) => apiPages[call++]!);

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    const envelope = await factory.infinite(undefined).queryFn!({
      ...ctx,
      pageParam: null,
    });
    expect(pageFn).toHaveBeenCalledTimes(3);
    expect((envelope as any).data).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Carol' },
    ]);
  });

  it('nextPageParam in the envelope is the next batch starting cursor', async () => {
    let call = 0;
    const apiPages: PagedUsers[] = [
      { users: [{ id: '1', name: 'Alice' }], nextCursor: 'c2' },
      { users: [{ id: '2', name: 'Bob' }], nextCursor: 'c3' },
    ];
    const pageFn = vi.fn(async (_p: void, _ctx: any) => apiPages[call++]!);

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: combined => (combined?.length ?? 0) < 1,
    });

    const envelope = await factory.infinite(undefined).queryFn!({
      ...ctx,
      pageParam: null,
    });
    // crawl stopped after first page (1 user < 1 is false immediately? No: 1 < 1 is false)
    // Wait: after page 1, combined.length = 1, shouldFetchNextPage(1 < 1) = false → stop
    // nextBatchParam = getNextPageParam(page1) = 'c2'
    expect((envelope as any).nextPageParam).toBe('c2');
  });

  it("TanStack's getNextPageParam is wired to the envelope's nextPageParam", async () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: 'next' }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: () => false,
    });

    const opts = factory.infinite(undefined);
    const envelope = await opts.queryFn!({ ...ctx, pageParam: null });
    const next = opts.getNextPageParam!(
      envelope as any,
      [envelope as any],
      null,
      [null],
    );
    expect(next).toBe('next');
  });

  it('select unwraps the envelope and applies per-page user select', async () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      select: ((users: User[]) => users.map(u => u.name)) as any,
      shouldFetchNextPage: () => false,
    });

    const opts = factory.infinite(undefined);
    const envelope1 = await opts.queryFn!({ ...ctx, pageParam: null });
    const envelope2 = await opts.queryFn!({ ...ctx, pageParam: null });

    const result = opts.select!({
      pages: [envelope1 as any, envelope2 as any],
      pageParams: [null, null],
    });
    expect(result).toEqual({
      pages: [['Alice'], ['Alice']],
      pageParams: [null, null],
    });
  });

  it('shouldFetchNextPage controls the size of each virtual page', async () => {
    let call = 0;
    const cursors = ['c2', 'c3', 'c4', 'c5'];
    const pageFn = vi.fn(
      async () =>
        ({
          users: [{ id: String(call), name: 'u' + call }],
          nextCursor: cursors[call++] ?? null,
        }) as PagedUsers,
    );

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: (combined, opts: { minResults?: number }) =>
        (combined?.length ?? 0) < (opts.minResults ?? 2),
    });

    // Two API calls per virtual page (minResults: 2)
    await factory.infinite(undefined, { minResults: 2 }).queryFn!({
      ...ctx,
      pageParam: null,
    });
    expect(pageFn).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when signal is already aborted before any page is fetched', async () => {
    const controller = new AbortController();
    controller.abort();

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () =>
        ({
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: null,
        }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    await expect(
      factory.infinite(undefined).queryFn!({
        signal: controller.signal,
        meta: undefined,
        pageParam: null,
      } as any),
    ).rejects.toThrow('Aborted');
  });

  it('returns partial data (no throw) when signal aborts mid-crawl after at least one page', async () => {
    const controller = new AbortController();
    let call = 0;

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => {
        const page = {
          users: [{ id: String(call + 1), name: `u${call + 1}` }],
          nextCursor: 'next',
        } as PagedUsers;
        if (call++ === 0) controller.abort();
        return page;
      },
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    const envelope = await factory.infinite(undefined).queryFn!({
      ...ctx,
      signal: controller.signal,
      pageParam: null,
    } as any);
    expect((envelope as any).data).toEqual([{ id: '1', name: 'u1' }]);
  });

  it('handles an empty page — returns empty data and null nextPageParam', async () => {
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    const envelope = await factory.infinite(undefined).queryFn!({
      ...ctx,
      pageParam: null,
    });
    expect((envelope as any).data).toEqual([]);
    expect((envelope as any).nextPageParam).toBeNull();
  });

  it('propagates queryFn errors thrown during an infinite crawl', async () => {
    let call = 0;
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => {
        if (call++ === 1) throw new Error('page 2 failed');
        return {
          users: [{ id: '1', name: 'Alice' }],
          nextCursor: 'p2',
        } as PagedUsers;
      },
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    await expect(
      factory.infinite(undefined).queryFn!({ ...ctx, pageParam: null }),
    ).rejects.toThrow('page 2 failed');
  });

  it('passes getPreviousPageParam through to infinite crawling options', () => {
    const gpp = vi.fn();
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      shouldFetchNextPage: () => true,
      getPreviousPageParam: gpp,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
    });

    expect(factory.infinite(undefined).getPreviousPageParam).toBe(gpp);
  });

  it('starts the second virtual page from the next batch param', async () => {
    const pageFn = vi.fn(
      async (_p: void, ctx: any) =>
        ({
          users: [{ id: ctx.pageParam ?? 'start', name: 'u' }],
          nextCursor: ctx.pageParam === 'c2' ? null : 'c2',
        }) as PagedUsers,
    );

    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: pageFn,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as string | null,
      reduce: (acc, p): User[] => [...(acc ?? []), ...p.users],
      shouldFetchNextPage: () => false, // one API call per virtual page
    });

    const opts = factory.infinite(undefined);
    const envelope1 = await opts.queryFn!({ ...ctx, pageParam: null });
    const nextParam = opts.getNextPageParam!(envelope1 as any, [], null, []);
    // nextParam should be 'c2' — where the next virtual page starts
    const envelope2 = await opts.queryFn!({ ...ctx, pageParam: nextParam });

    expect((envelope1 as any).data[0].id).toBe('start');
    expect((envelope2 as any).data[0].id).toBe('c2');
  });
});

// ---------------------------------------------------------------------------
// Type-level tests
// These run under tsc (strict) and vitest's expectTypeOf so regressions in
// either direction are caught at compile time.
// ---------------------------------------------------------------------------

describe('queryFactory – types', () => {
  type SomeUser = { id: string; name: string };
  type Cursor = string | null;

  it('ResolvedQueryOptions is not assignable to UseInfiniteQueryOptions', () => {
    // initialPageParam?: never makes the type structurally incompatible with
    // UseInfiniteQueryOptions which requires initialPageParam: TPageParam.
    expectTypeOf<
      ResolvedQueryOptions<SomeUser[], Error, SomeUser[]>
    >().not.toMatchTypeOf<
      UseInfiniteQueryOptions<SomeUser[], Error, SomeUser[], QueryKey, Cursor>
    >();
  });

  it('ResolvedInfiniteOptions is not assignable to UseQueryOptions', () => {
    // select: (data: InfiniteData<TData, TPageParam>) => any is contravariant:
    // UseQueryOptions expects select: (data: TData) => TSelected, and TData is
    // not assignable to InfiniteData<TData, TPageParam>.
    expectTypeOf<
      ResolvedInfiniteOptions<SomeUser[], Error, Cursor>
    >().not.toMatchTypeOf<
      UseQueryOptions<SomeUser[], Error, SomeUser[], QueryKey>
    >();
  });

  it('child select data is typed as child queryFn return type, not parent', () => {
    type AdminUser = { id: string; role: 'admin' };
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: async () => [] as SomeUser[],
    });
    const child = queryFactory(parent, {
      queryFn: async () => [] as AdminUser[],
      select: data => data,
    });
    expectTypeOf(child(undefined).select!)
      .parameter(0)
      .toEqualTypeOf<AdminUser[]>();
  });

  it('context.pageParam is typed as the page param type when initialPageParam is provided', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void, ctx) => {
        expectTypeOf(ctx.pageParam).toEqualTypeOf<Cursor>();
        return { users: [], nextCursor: null } as PagedUsers;
      },
      getNextPageParam: (p: PagedUsers) => p.nextCursor,
      initialPageParam: null as Cursor,
    });
  });

  it('context.pageParam is inferred from getNextPageParam when initialPageParam is absent', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void, ctx) => {
        // TPageParam is inferred from getNextPageParam's return type (string | null → string)
        expectTypeOf(ctx.pageParam).toEqualTypeOf<string>();
        return { users: [], nextCursor: null } as PagedUsers;
      },
      getNextPageParam: (p: PagedUsers) => p.nextCursor,
    });
  });

  it('context.pageParam is not concretely typed when no pagination is configured', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void, ctx) => {
        expectTypeOf(ctx.pageParam).not.toEqualTypeOf<Cursor>();
        return [] as SomeUser[];
      },
    });
  });

  it('shouldFetchNextPage combined param is TSelected (not | undefined) when reduce is present', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as Cursor,
      reduce: (_acc, page): SomeUser[] => page.users,
      shouldFetchNextPage: combined => {
        expectTypeOf(combined).toEqualTypeOf<SomeUser[]>();
        return combined.length < 10;
      },
    });
  });

  it('shouldFetchNextPage combined param is TSelected | undefined when reduce is absent', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as Cursor,
      shouldFetchNextPage: combined => {
        expectTypeOf(combined).toEqualTypeOf<PagedUsers | undefined>();
        return true;
      },
    });
  });

  it('shouldFetchNextPage combined param on a child factory is typed (not any)', () => {
    const parent = queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void) =>
        ({ users: [], nextCursor: null }) as PagedUsers,
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as Cursor,
      reduce: (_acc, page): SomeUser[] => page.users,
    });
    queryFactory(parent, {
      shouldFetchNextPage: combined => {
        expectTypeOf(combined).not.toBeAny();
        // parent has reduce → combined is TChildSelected, not | undefined
        expectTypeOf(combined).toEqualTypeOf<SomeUser[]>();
        return combined.length > 0;
      },
    });
  });

  it('select on ResolvedInfiniteOptions returns InfiniteData<TSelected>, not any (prevents inference poisoning)', () => {
    // ResolvedInfiniteOptions.select previously had return type `any`. TS6 uses the
    // any-returning optional field as a candidate for inferring TResult when the caller
    // spreads the options and adds their own select, poisoning the result type.
    // The fix carries TResult = InfiniteData<TSelected, TPageParam> through the type so
    // TanStack can infer the correct data type for both direct-pass and spread-with-select.
    const factory = queryFactory({
      queryKey: ['users'],
      queryFn: async () => ({ users: [] as SomeUser[], nextCursor: null }),
      getNextPageParam: p => p.nextCursor,
      initialPageParam: null as null,
      reduce: (_acc, p): SomeUser[] => [...(_acc ?? []), ...p.users],
      shouldFetchNextPage: () => true,
    });

    type Opts = ReturnType<typeof factory.infinite>;
    type SelectReturn = ReturnType<NonNullable<Opts['select']>>;
    expectTypeOf<SelectReturn>().toEqualTypeOf<
      InfiniteData<SomeUser[], null>
    >();
  });

  it('StandardQueryOptions fields are accepted on factory config', () => {
    queryFactory({
      queryKey: ['users'],
      queryFn: (_params: void) => [] as SomeUser[],
      enabled: query => query.queryKey.length > 0,
      staleTime: query => (query.state.data ? Infinity : 0),
      retryOnMount: false,
      initialData: [] as SomeUser[],
      placeholderData: [] as SomeUser[],
      queryKeyHashFn: key => JSON.stringify(key),
      structuralSharing: (oldData, newData) => newData ?? oldData,
      experimental_prefetchInRender: false,
    });
  });
});
