import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Badge,
  Box,
  Button,
  SpaceBetween,
  TextContent,
} from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import highlight from '@cloudscape-design/code-view/highlight/typescript';
import pageSource from './WalkthroughPage.tsx?raw';

export const handle = { label: 'Walkthrough', source: pageSource };
export async function loader() {
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stage {
  phase: 1 | 2 | 3;
  title: string;
  narration: string;
  code: string;
  duration?: number;
}

// Raw output of the LCS line-diff
type RawOp =
  | { type: 'keep'; line: string }
  | { type: 'remove'; line: string }
  | { type: 'add'; line: string };

// Higher-level animation ops built from RawOps
type AnimOp =
  | { kind: 'keep'; line: string }
  // Replace: erase old suffix → type new suffix (common prefix stays put)
  | { kind: 'replace'; prev: string; next: string; prefix: string }
  // Pure removal: erase content, then close the row
  | { kind: 'remove'; line: string }
  // Pure insertion: open a blank row, then type content in
  | { kind: 'insert'; line: string };

// ── Phase metadata ────────────────────────────────────────────────────────────

const PHASE_META = {
  1: { label: 'Before', color: 'grey' as const },
  2: { label: 'The cracks show', color: 'red' as const },
  3: { label: 'queryFactory', color: 'green' as const },
};

const PHASE_ACCENT: Record<1 | 2 | 3, string> = {
  1: '#7d8998',
  2: '#d13212',
  3: '#1d8102',
};

const DEFAULT_MS = 6000;

// ── Stages ────────────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
  {
    phase: 1,
    title: 'Inline useQuery',
    narration:
      'Everything inline — key, queryFn, params hardcoded. Works for a prototype, breaks the moment anything needs to be reused.',
    code: `\
function InstanceList() {
  const { data, isLoading } = useQuery({
    queryKey: ['instances'],
    queryFn: () =>
      ec2.send(new DescribeInstancesCommand({ MaxResults: 20 })),
  });

  const instances =
    data?.Reservations?.flatMap(r => r.Instances ?? []) ?? [];

  return <InstanceTable items={instances} loading={isLoading} />;
}`,
  },
  {
    phase: 1,
    title: 'Custom hook',
    narration:
      'Extract to a hook — params no longer hardcoded, query reusable across components. But the key is still trapped: no prefetching from a route loader.',
    code: `\
function useInstances(params: DescribeInstancesRequest) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => ec2.send(new DescribeInstancesCommand(params)),
  });
}

function InstanceList({ params }: Props) {
  const { data, isLoading } = useInstances(params);
  // ...
}

// Can't reach the key from outside the hook:
// queryClient.prefetchQuery(???)`,
  },
  {
    phase: 2,
    title: 'Generics multiply',
    narration:
      'A select option forces a generic. Every new option grows the signature further. The key is still trapped — prefetching from a loader is still impossible.',
    code: `\
function useInstances<TSelected = Instance[]>(
  params: DescribeInstancesRequest,
  options?: { select?: (data: Instance[]) => TSelected },
) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => ec2.send(new DescribeInstancesCommand(params)),
    select: options?.select,
  });
}

// One more option = one more generic type parameter.
// Key is still trapped inside the hook.`,
  },
  {
    phase: 2,
    title: 'Infinite variant',
    narration:
      'Infinite scroll needs a second hook. The key gets a differentiator to avoid a cache collision. Two hooks now duplicate the queryFn and key — and must stay in sync forever.',
    duration: 8000,
    code: `\
function useInstances<TSelected = Instance[]>(
  params: DescribeInstancesRequest,
  options?: { select?: (data: Instance[]) => TSelected },
) {
  return useQuery({ queryKey: ['instances', params], /* ... */ });
}

// Separate hook — key and queryFn are duplicated
function useInstancesInfinite(params: DescribeInstancesRequest) {
  return useInfiniteQuery({
    queryKey: ['instances', 'infinite', params], // stays in sync manually
    queryFn: ({ pageParam }) =>
      ec2.send(
        new DescribeInstancesCommand({ ...params, NextToken: pageParam }),
      ),
    getNextPageParam: r => r.NextToken,
    initialPageParam: undefined,
  });
}`,
  },
  {
    phase: 2,
    title: 'queryOptions',
    narration:
      'queryOptions liberates the key — prefetch and invalidation can reference it from anywhere. But pagination is still unsolved, and invalidation still needs a magic string.',
    code: `\
const instancesOptions = (params: DescribeInstancesRequest) =>
  queryOptions({
    queryKey: ['instances', params],
    queryFn: () => ec2.send(new DescribeInstancesCommand(params)),
  });

// Key can now travel to a loader or mutation handler:
useQuery(instancesOptions(params));
queryClient.prefetchQuery(instancesOptions(params));

// But invalidation still needs a magic string:
queryClient.invalidateQueries({ queryKey: ['instances'] });`,
  },
  {
    phase: 2,
    title: 'Pagination loop baked in',
    narration:
      'Bake the crawl loop into queryFn to get all pages. Every call site now fetches everything — no early stop. Copy-paste this into every paginated query.',
    duration: 8000,
    code: `\
const instancesOptions = (params: DescribeInstancesRequest) =>
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

// Every call site gets all pages — can't stop at 50 for a dropdown.
// Copy-paste this into every paginated query.`,
  },
  {
    phase: 3,
    title: 'Meet queryFactory',
    narration:
      'One definition: key, queryFn, pagination, accumulation, and crawl control. The factory pays the cost once so every call site stays clean.',
    duration: 8000,
    code: `\
const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesRequest, ctx) =>
    ec2.send(
      new DescribeInstancesCommand({ ...params, NextToken: ctx.pageParam ?? params.NextToken }),
      { abortSignal: ctx.signal },
    ),
  getNextPageParam: r => r.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults != null && instances.length < opts.minResults,
});`,
  },
  {
    phase: 3,
    title: 'Call sites',
    narration:
      'Each call site controls how much to crawl. The key travels freely. Different minResults values produce separate, independently-crawling cache entries.',
    code: `\
// Crawl all pages — data is Instance[]
const { data } = useQuery(describeInstances({ MaxResults: 20 }));

// Stop at 50 — separate cache entry, crawls independently
const { data } = useQuery(
  describeInstances({ MaxResults: 20 }, { minResults: 50 }),
);

// Prefetch in a route loader — key is not trapped
await queryClient.prefetchQuery(describeInstances({ MaxResults: 20 }));`,
  },
  {
    phase: 3,
    title: '.infinite()',
    narration:
      'UI-driven pagination from the same factory. No second hook, no key collision, no duplication. Each virtual page is itself a crawl.',
    code: `\
// Same factory — no second hook, no duplicated key or queryFn
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery(
  describeInstances.infinite({ MaxResults: 20 }, { minResults: 50 }),
);
// data.pages is Instance[][] — 50 items per virtual page,
// each backed by up to 5 API calls

// Keys stay separate automatically:
// useQuery         → ['ec2:DescribeInstances', { MaxResults: 20 }]
// useInfiniteQuery → ['ec2:DescribeInstances', 'infinite', { MaxResults: 20 }]`,
  },
  {
    phase: 3,
    title: 'Composition',
    narration:
      "A child factory inherits the parent's queryFn and key. Two views of one cache entry — one API crawl, no extra fetch.",
    code: `\
const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'running'),
});

// Both use the same cache entry — no extra API call
const { data: all }     = useQuery(describeInstances({ MaxResults: 20 }));
const { data: running } = useQuery(runningInstances({ MaxResults: 20 }));
//                                  ↑ select is client-side; cache is shared

// Parent selects compose automatically into child factories`,
  },
  {
    phase: 3,
    title: 'Invalidation',
    narration:
      'Two granularities, zero magic strings. Factory keys form a strict prefix hierarchy — bust the namespace or just one param set and its descendants.',
    duration: 7000,
    code: `\
// Bust every variant and param set in the namespace
queryClient.invalidateQueries(describeInstances());

// Bust only this param set — cascades to runningInstances and all children
queryClient.invalidateQueries(describeInstances({ MaxResults: 20 }));

// Key hierarchy:
// ['ec2:DescribeInstances']
//   └─ ['ec2:DescribeInstances', { MaxResults: 20 }]
//       ├─ runningInstances({ MaxResults: 20 })   (same entry — select not in key)
//       └─ ['ec2:DescribeInstances', { MaxResults: 20 }, 'find', { instanceId: 'i-abc' }]`,
  },
];

// ── Padding ───────────────────────────────────────────────────────────────────

const MAX_LINES = Math.max(...STAGES.map(s => s.code.split('\n').length));

function padToHeight(content: string): string {
  const n = content.split('\n').length;
  return n < MAX_LINES ? content + '\n'.repeat(MAX_LINES - n) : content;
}

// ── LCS line-diff ─────────────────────────────────────────────────────────────

function rawDiff(oldCode: string, newCode: string): RawOp[] {
  const a = oldCode.split('\n');
  const b = newCode.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const ops: RawOp[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'keep', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: b[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'remove', line: a[i - 1] });
      i--;
    }
  }
  return ops;
}

// ── Build AnimOps from RawOps ─────────────────────────────────────────────────

function sharedPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

function buildAnimOps(ops: RawOp[]): AnimOp[] {
  const result: AnimOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'keep') {
      result.push({ kind: 'keep', line: ops[i].line });
      i++;
      continue;
    }
    // Gather a contiguous block of removes then adds
    const removes: string[] = [];
    const adds: string[] = [];
    while (i < ops.length && ops[i].type === 'remove') {
      removes.push(ops[i].line);
      i++;
    }
    while (i < ops.length && ops[i].type === 'add') {
      adds.push(ops[i].line);
      i++;
    }
    // Pair 1:1 as replaces; remaining are pure removes / inserts
    const pairs = Math.min(removes.length, adds.length);
    for (let k = 0; k < pairs; k++) {
      result.push({
        kind: 'replace',
        prev: removes[k],
        next: adds[k],
        prefix: sharedPrefix(removes[k], adds[k]),
      });
    }
    for (let k = pairs; k < removes.length; k++) {
      result.push({ kind: 'remove', line: removes[k] });
    }
    for (let k = pairs; k < adds.length; k++) {
      result.push({ kind: 'insert', line: adds[k] });
    }
  }
  return result;
}

// ── Content animation ─────────────────────────────────────────────────────────

// Phase 1: erase old suffixes / removed lines (right-to-left, all at once)
const T_ERASE = 380;
// Phase 2: structural — removed blank rows close, insert blank rows open
const T_STRUCT = 420;
// Phase 3: typing begins, staggered by position
const T_TYPE = 480;
const TYPE_SPEED = 5; // ms per character
const TYPE_STAGGER = 45; // ms between each typing op starting

function contentAt(ops: AnimOp[], t: number): string {
  const lines: string[] = [];
  let typeIdx = 0;

  for (const op of ops) {
    if (op.kind === 'keep') {
      lines.push(op.line);
      continue;
    }

    if (op.kind === 'replace') {
      const oldSuffix = op.prev.slice(op.prefix.length);
      const newSuffix = op.next.slice(op.prefix.length);

      if (t <= T_ERASE) {
        // Erase old suffix from the right
        const p = t / T_ERASE;
        const keep = Math.ceil(oldSuffix.length * (1 - p));
        lines.push(op.prefix + oldSuffix.slice(0, keep));
      } else {
        // Type new suffix from the left, staggered
        const start = T_TYPE + typeIdx * TYPE_STAGGER;
        const typed = Math.min(
          newSuffix.length,
          Math.max(0, Math.floor((t - start) / TYPE_SPEED)),
        );
        lines.push(op.prefix + newSuffix.slice(0, typed));
      }
      typeIdx++;
      continue;
    }

    if (op.kind === 'remove') {
      if (t <= T_ERASE) {
        // Erase content from the right
        const p = t / T_ERASE;
        const keep = Math.ceil(op.line.length * (1 - p));
        if (keep > 0) {
          lines.push(op.line.slice(0, keep));
        } else {
          lines.push(''); // briefly a blank row before it closes
        }
      } else if (t < T_STRUCT) {
        lines.push(''); // blank row still open before structural phase
      }
      // t >= T_STRUCT: row is gone
      continue;
    }

    // insert
    if (t >= T_STRUCT) {
      // Row has opened; type content in from the left, staggered
      const start = T_TYPE + typeIdx * TYPE_STAGGER;
      const typed = Math.min(
        op.line.length,
        Math.max(0, Math.floor((t - start) / TYPE_SPEED)),
      );
      lines.push(op.line.slice(0, typed));
    }
    // t < T_STRUCT: row doesn't exist yet
    typeIdx++;
  }

  return lines.join('\n');
}

function animDuration(ops: AnimOp[]): number {
  let typeIdx = 0;
  let maxEnd = T_ERASE;

  for (const op of ops) {
    if (op.kind === 'replace') {
      const suffixLen = op.next.length - op.prefix.length;
      maxEnd = Math.max(
        maxEnd,
        T_TYPE + typeIdx * TYPE_STAGGER + suffixLen * TYPE_SPEED,
      );
      typeIdx++;
    } else if (op.kind === 'insert') {
      maxEnd = Math.max(
        maxEnd,
        T_TYPE + typeIdx * TYPE_STAGGER + op.line.length * TYPE_SPEED,
      );
      typeIdx++;
    }
  }

  return maxEnd + 250;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function EvolutionPage() {
  const [stageIndex, setStageIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [animState, setAnimState] = useState<{
    content: string;
    targetIndex: number;
  } | null>(null);

  const rafRef = useRef<number | null>(null);

  const isTransitioning = animState !== null;
  const visibleIndex = animState?.targetIndex ?? stageIndex;
  const stage = STAGES[visibleIndex];
  const phaseMeta = PHASE_META[stage.phase];
  const accent = PHASE_ACCENT[stage.phase];
  const durationMs = stage.duration ?? DEFAULT_MS;

  const cancelAnim = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const goToStage = useCallback(
    (nextIndex: number) => {
      cancelAnim();
      setProgress(0);

      const ops = buildAnimOps(
        rawDiff(STAGES[stageIndex].code, STAGES[nextIndex].code),
      );
      const dur = animDuration(ops);
      const t0 = performance.now();

      const tick = (now: number) => {
        const t = now - t0;
        if (t >= dur) {
          setAnimState(null);
          setStageIndex(nextIndex);
          rafRef.current = null;
        } else {
          setAnimState({ content: contentAt(ops, t), targetIndex: nextIndex });
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [stageIndex, cancelAnim],
  );

  const handlePrev = useCallback(() => {
    setPlaying(false);
    const from = animState?.targetIndex ?? stageIndex;
    goToStage((from - 1 + STAGES.length) % STAGES.length);
  }, [stageIndex, animState, goToStage]);

  const handleNext = useCallback(() => {
    setPlaying(false);
    const from = animState?.targetIndex ?? stageIndex;
    goToStage((from + 1) % STAGES.length);
  }, [stageIndex, animState, goToStage]);

  // Progress bar (only while stable)
  useEffect(() => {
    if (!playing || isTransitioning) {
      setProgress(0);
      return;
    }
    setProgress(0);
    const start = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / durationMs) * 100, 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [stageIndex, playing, isTransitioning, durationMs]);

  // Auto-advance (only while stable)
  useEffect(() => {
    if (!playing || isTransitioning) return;
    const id = setTimeout(
      () => goToStage((stageIndex + 1) % STAGES.length),
      durationMs,
    );
    return () => clearTimeout(id);
  }, [stageIndex, playing, isTransitioning, durationMs, goToStage]);

  const displayContent = padToHeight(
    (animState?.content ?? STAGES[stageIndex].code).trim(),
  );

  return (
    <SpaceBetween size="m">
      <SpaceBetween size="xs" direction="horizontal" alignItems="center">
        <Badge color={phaseMeta.color}>{phaseMeta.label}</Badge>
        <Box color="text-body-secondary" fontSize="body-s">
          {visibleIndex + 1} / {STAGES.length}
        </Box>
      </SpaceBetween>

      <Box fontWeight="bold" fontSize="heading-m">
        {stage.title}
      </Box>

      {/* CodeView — always the renderer, content string animates */}
      <div
        style={{
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <CodeView content={displayContent} highlight={highlight} lineNumbers />
        <div
          style={{
            height: 3,
            background: 'var(--color-background-input-disabled, #d5dbdb)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: accent,
              transition: 'width 0.05s linear',
            }}
          />
        </div>
      </div>

      {/* Controls — centered below the code block */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <Button onClick={handlePrev} variant="link">
            ← Prev
          </Button>
          <Button onClick={() => setPlaying(p => !p)} variant="normal">
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button onClick={handleNext} variant="link">
            Next →
          </Button>

          <Box padding={{ left: 'xs' }}>
            <SpaceBetween size="xxs" direction="horizontal">
              {STAGES.map((s, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Stage ${i + 1}: ${s.title}`}
                  onClick={() => {
                    setPlaying(false);
                    goToStage(i);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setPlaying(false);
                      goToStage(i);
                    }
                  }}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background:
                      i === visibleIndex
                        ? PHASE_ACCENT[s.phase]
                        : 'var(--color-background-input-disabled, #d5dbdb)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </div>

      <TextContent>
        <Box color="text-body-secondary">{stage.narration}</Box>
      </TextContent>
    </SpaceBetween>
  );
}

export { EvolutionPage as Component };
