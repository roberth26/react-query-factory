import { useState } from 'react';
import type { ReactNode } from 'react';
import {
	useQuery,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from '@tanstack/react-query';
import { queryFactory } from 'react-query-factory';
import { Highlight, themes } from 'prism-react-renderer';

// ── Mock AWS SDK types ────────────────────────────────────────────────────────

interface Filter {
	Name: string;
	Values: string[];
}

interface DescribeInstancesCommandInput {
	Filters?: Filter[];
	MaxResults?: number;
	NextToken?: string;
}

interface StopInstancesCommandInput {
	InstanceIds: string[];
}

interface Instance {
	InstanceId: string;
	InstanceType: string;
	State: { Name: 'running' | 'stopped' | 'terminated' };
	Tags: Array<{ Key: string; Value: string }>;
}

interface DescribeInstancesResponse {
	Reservations: Array<{ Instances: Instance[] }>;
	NextToken?: string;
}

interface StopInstancesResponse {
	StoppingInstances: Array<{
		InstanceId: string;
		CurrentState: { Name: string };
	}>;
}

class DescribeInstancesCommand {
	constructor(public readonly input: DescribeInstancesCommandInput) {}
}

class StopInstancesCommand {
	constructor(public readonly input: StopInstancesCommandInput) {}
}

// ── Mock API ──────────────────────────────────────────────────────────────────

const INSTANCE_TYPES = [
	't2.micro',
	't3.small',
	't3.medium',
	'm5.large',
	'c5.xlarge',
] as const;
const STATES: Instance['State']['Name'][] = [
	'running',
	'running',
	'running',
	'running',
	'stopped',
	'running',
	'running',
	'running',
	'stopped',
	'terminated',
];

const ALL_INSTANCES: Instance[] = Array.from({ length: 95 }, (_, i) => ({
	InstanceId: `i-${String(i + 1).padStart(4, '0')}`,
	InstanceType: INSTANCE_TYPES[i % INSTANCE_TYPES.length]!,
	State: { Name: STATES[i % STATES.length]! },
	Tags: [{ Key: 'Name', Value: `instance-${String(i + 1).padStart(4, '0')}` }],
}));

class EC2Client {
	constructor(public readonly config: { region: string }) {}

	send(
		command: DescribeInstancesCommand,
		options?: { abortSignal?: AbortSignal },
	): Promise<DescribeInstancesResponse>;
	send(
		command: StopInstancesCommand,
		options?: { abortSignal?: AbortSignal },
	): Promise<StopInstancesResponse>;
	async send(
		command: DescribeInstancesCommand | StopInstancesCommand,
		_options?: { abortSignal?: AbortSignal },
	): Promise<DescribeInstancesResponse | StopInstancesResponse> {
		await new Promise(r => setTimeout(r, 150 + Math.random() * 100));

		if (command instanceof StopInstancesCommand) {
			const { InstanceIds } = command.input;
			for (const id of InstanceIds) {
				const inst = ALL_INSTANCES.find(i => i.InstanceId === id);
				if (inst && inst.State.Name === 'running') inst.State.Name = 'stopped';
			}
			return {
				StoppingInstances: InstanceIds.map(id => ({
					InstanceId: id,
					CurrentState: { Name: 'stopped' },
				})),
			};
		}

		const { Filters, MaxResults = 20, NextToken } = command.input;
		let instances = ALL_INSTANCES;
		if (Filters) {
			for (const filter of Filters) {
				if (filter.Name === 'instance-state-name') {
					instances = instances.filter(i =>
						filter.Values.includes(i.State.Name),
					);
				}
			}
		}
		const start = NextToken ? parseInt(NextToken, 10) : 0;
		const page = instances.slice(start, start + MaxResults);
		const nextToken =
			start + MaxResults < instances.length
				? String(start + MaxResults)
				: undefined;
		return { Reservations: [{ Instances: page }], NextToken: nextToken };
	}
}

// ── Factories ─────────────────────────────────────────────────────────────────

const ec2 = new EC2Client({ region: 'us-east-1' });

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
		...page.Reservations.flatMap(r => r.Instances),
	],
	shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
		opts.minResults != null && (instances?.length ?? 0) < opts.minResults,
	staleTime: 30_000,
});

const runningInstances = queryFactory(describeInstances, {
	select: instances => instances.filter(i => i.State.Name === 'running'),
});

const findInstance = queryFactory(describeInstances, {
	queryKey: ['find'],
	shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
		opts.instanceId != null &&
		!instances?.some(i => i.InstanceId === opts.instanceId),
});

// ── UI helpers ────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<Instance['State']['Name'], string> = {
	running: '#4ade80',
	stopped: '#fb923c',
	terminated: '#64748b',
};

function Badge({ children }: { children: ReactNode }) {
	return (
		<span
			style={{
				display: 'inline-block',
				padding: '2px 10px',
				borderRadius: 12,
				background: '#1e3a5f',
				color: '#93c5fd',
				fontSize: 12,
				fontWeight: 600,
			}}
		>
			{children}
		</span>
	);
}

function CodeSnippet({ code }: { code: string }) {
	return (
		<Highlight theme={themes.oneDark} code={code.trim()} language="tsx">
			{({ className, style, tokens, getLineProps, getTokenProps }) => (
				<pre
					className={className}
					style={{
						...style,
						border: '1px solid #334155',
						borderRadius: 8,
						padding: '12px 16px',
						fontSize: 12,
						fontFamily: 'ui-monospace, "Cascadia Code", monospace',
						overflowX: 'auto',
						lineHeight: 1.6,
						margin: '0 0 20px 0',
					}}
				>
					{tokens.map((line, i) => (
						<div key={i} {...getLineProps({ line })}>
							{line.map((token, j) => (
								<span key={j} {...getTokenProps({ token })} />
							))}
						</div>
					))}
				</pre>
			)}
		</Highlight>
	);
}

function InstanceTable({
	instances,
	highlightId,
	onStop,
	stoppingIds,
}: {
	instances: Instance[];
	highlightId?: string;
	onStop?: (id: string) => void;
	stoppingIds?: Set<string>;
}) {
	const cols = onStop
		? ['Instance ID', 'Type', 'State', '']
		: ['Instance ID', 'Type', 'State'];
	return (
		<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
			<thead>
				<tr style={{ background: '#0f172a' }}>
					{cols.map(h => (
						<th
							key={h}
							style={{
								padding: '8px 12px',
								textAlign: 'left',
								fontWeight: 600,
								color: '#64748b',
							}}
						>
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{instances.map((inst, i) => (
					<tr
						key={inst.InstanceId}
						style={{
							background:
								inst.InstanceId === highlightId
									? '#2d2a00'
									: i % 2
										? '#1a2840'
										: '#131e2e',
							borderBottom: '1px solid #1e293b',
						}}
					>
						<td
							style={{
								padding: '6px 12px',
								fontFamily: 'monospace',
								color: '#e2e8f0',
							}}
						>
							{inst.InstanceId}
						</td>
						<td style={{ padding: '6px 12px', color: '#64748b' }}>
							{inst.InstanceType}
						</td>
						<td style={{ padding: '6px 12px' }}>
							<span
								style={{
									color: STATE_COLORS[inst.State.Name],
									fontWeight: 500,
								}}
							>
								{inst.State.Name}
							</span>
						</td>
						{onStop && (
							<td style={{ padding: '6px 12px' }}>
								{inst.State.Name === 'running' && (
									<button
										onClick={() => onStop(inst.InstanceId)}
										disabled={stoppingIds?.has(inst.InstanceId)}
										style={{
											padding: '3px 10px',
											fontSize: 12,
											borderRadius: 6,
											border: '1px solid #7f1d1d',
											background: stoppingIds?.has(inst.InstanceId)
												? '#450a0a'
												: 'transparent',
											color: '#fca5a5',
											cursor: stoppingIds?.has(inst.InstanceId)
												? 'default'
												: 'pointer',
										}}
									>
										{stoppingIds?.has(inst.InstanceId) ? 'Stopping…' : 'Stop'}
									</button>
								)}
							</td>
						)}
					</tr>
				))}
			</tbody>
		</table>
	);
}

const btn = (active = false, disabled = false) => ({
	padding: '7px 16px',
	background: active ? '#3b82f6' : disabled ? '#0f172a' : '#1e293b',
	color: active ? 'white' : disabled ? '#475569' : '#cbd5e1',
	border: '1px solid',
	borderColor: active ? '#3b82f6' : disabled ? '#1e293b' : '#334155',
	borderRadius: 8,
	fontWeight: 500,
	fontSize: 14,
	cursor: disabled ? 'default' : 'pointer',
	transition: 'all 0.1s',
});

// ── Demos ─────────────────────────────────────────────────────────────────────

function BasicDemo() {
	const { data, isLoading, isFetching } = useQuery(
		describeInstances({ MaxResults: 10 }),
	);

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				A single <code style={{ background: 'rgb(15, 23, 42)' }}>useQuery</code>{' '}
				call with no{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>minResults</code> —
				<code style={{ background: 'rgb(15, 23, 42)' }}>
					shouldFetchNextPage
				</code>{' '}
				returns false immediately, so only one API call is made regardless of
				how many pages exist.
			</p>
			<CodeSnippet
				code={`const { data } = useQuery(
  describeInstances({ MaxResults: 10 })
  // no minResults → shouldFetchNextPage returns false → 1 API call
);`}
			/>
			{isLoading ? (
				<p style={{ color: '#64748b' }}>Fetching…</p>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							marginBottom: 12,
						}}
					>
						<Badge>{data!.length} instances (1 API call)</Badge>
						{isFetching && (
							<span style={{ color: '#64748b', fontSize: 13 }}>
								re-fetching…
							</span>
						)}
					</div>
					<InstanceTable instances={data!} />
				</>
			)}
		</div>
	);
}

function CrawlingDemo() {
	const { data, isLoading, isFetching } = useQuery(
		describeInstances(
			{ MaxResults: 5 },
			{ minResults: Number.MAX_SAFE_INTEGER },
		),
	);

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				Passing{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>
					minResults: Infinity
				</code>{' '}
				keeps{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>
					shouldFetchNextPage
				</code>{' '}
				returning true until the API has no more pages. The factory crawls all
				19 pages and reduces them into one flat array.
			</p>
			<CodeSnippet
				code={`const { data } = useQuery(
  describeInstances(
    { MaxResults: 5 },
    { minResults: Infinity }, // crawl until all pages exhausted
  )
);
// data is Instance[] — all 95 instances, no pagination state`}
			/>
			{isLoading ? (
				<p style={{ color: '#64748b' }}>Crawling all 19 API pages…</p>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							marginBottom: 12,
						}}
					>
						<Badge>{data!.length} instances — 19 API calls</Badge>
						{isFetching && (
							<span style={{ color: '#64748b', fontSize: 13 }}>
								re-crawling…
							</span>
						)}
					</div>
					<InstanceTable instances={data!.slice(0, 15)} />
					{data!.length > 15 && (
						<p style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>
							…{data!.length - 15} more rows hidden
						</p>
					)}
				</>
			)}
		</div>
	);
}

function CompositionDemo() {
	const {
		data: all,
		isLoading: allLoading,
		isFetching: allFetching,
	} = useQuery(describeInstances({ MaxResults: 20 }));
	const { data: running, isLoading: runningLoading } = useQuery(
		runningInstances({ MaxResults: 20 }),
	);

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				<code style={{ background: 'rgb(15, 23, 42)' }}>runningInstances</code>{' '}
				is a child factory that inherits all config and adds a{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>select</code>. Both
				share the same cache entry — one fetch, two views.
			</p>
			<CodeSnippet
				code={`const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'running'),
});

useQuery(describeInstances({ MaxResults: 20 })) // → Instance[]
useQuery(runningInstances({ MaxResults: 20 }))  // → running Instance[] (same cache entry)`}
			/>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							marginBottom: 10,
						}}
					>
						<strong style={{ fontSize: 14, color: '#e2e8f0' }}>
							describeInstances
						</strong>
						<Badge>{all?.length ?? '…'} instances</Badge>
						{allFetching && (
							<span style={{ color: '#64748b', fontSize: 12 }}>fetching…</span>
						)}
					</div>
					{allLoading ? (
						<p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
					) : (
						<InstanceTable instances={all!} />
					)}
				</div>
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							marginBottom: 10,
						}}
					>
						<strong style={{ fontSize: 14, color: '#e2e8f0' }}>
							runningInstances
						</strong>
						<Badge>{running?.length ?? '…'} running</Badge>
					</div>
					{runningLoading ? (
						<p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
					) : (
						<InstanceTable instances={running ?? []} />
					)}
				</div>
			</div>
		</div>
	);
}

const SERVER_PAGE_SIZE = 5;
const UI_PAGE_SIZE_OPTIONS = [10, 20, 30];

function InfiniteWithCrawlingDemo() {
	const [viewPage, setViewPage] = useState(0);
	const [uiPageSize, setUiPageSize] = useState(10);

	const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
		useInfiniteQuery(
			describeInstances.infinite(
				{ MaxResults: SERVER_PAGE_SIZE },
				{ minResults: uiPageSize },
			),
		);

	const pages = (data?.pages ?? []) as Instance[][];
	const visibleInstances = pages[viewPage] ?? [];
	const totalLoaded = pages.reduce((s, p) => s + p.length, 0);
	const apiCallsPerPage = uiPageSize / SERVER_PAGE_SIZE;

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				Each UI page crawls multiple API calls internally. TanStack sees one
				virtual page per{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>fetchNextPage</code>{' '}
				call; the factory handles the multi-call crawl transparently.
			</p>
			<CodeSnippet
				code={`useInfiniteQuery(
  describeInstances.infinite(
    { MaxResults: 5 },          // server page size
    { minResults: uiPageSize }, // API calls per UI page = uiPageSize / 5
  )
)
// data.pages is Instance[][] — one flat array per virtual page`}
			/>

			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					marginBottom: 16,
				}}
			>
				<label style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>
					UI page size:
					<select
						value={uiPageSize}
						onChange={e => {
							setUiPageSize(Number(e.target.value));
							setViewPage(0);
						}}
						style={{
							marginLeft: 8,
							padding: '4px 8px',
							borderRadius: 6,
							border: '1px solid #334155',
							fontSize: 14,
							background: '#0f172a',
							color: '#e2e8f0',
						}}
					>
						{UI_PAGE_SIZE_OPTIONS.map(s => (
							<option key={s} value={s}>
								{s} instances ({s / SERVER_PAGE_SIZE} API calls/page)
							</option>
						))}
					</select>
				</label>
				<span style={{ fontSize: 13, color: '#475569' }}>
					server page size: {SERVER_PAGE_SIZE}
				</span>
			</div>

			<div
				style={{
					display: 'flex',
					gap: 8,
					marginBottom: 16,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}
			>
				{pages.map((page, i) => (
					<button
						key={i}
						style={btn(viewPage === i)}
						onClick={() => setViewPage(i)}
					>
						Page {i + 1}{' '}
						<span style={{ opacity: 0.7, fontSize: 12 }}>({page.length})</span>
					</button>
				))}
				{hasNextPage && (
					<button
						style={{
							...btn(false, isFetchingNextPage),
							background: isFetchingNextPage ? '#064e3b' : '#059669',
							color: isFetchingNextPage ? '#6ee7b7' : 'white',
							borderColor: '#059669',
						}}
						disabled={isFetchingNextPage}
						onClick={() => {
							const nextIdx = pages.length;
							void fetchNextPage().then(() => setViewPage(nextIdx));
						}}
					>
						{isFetchingNextPage
							? `Crawling ${apiCallsPerPage} API pages…`
							: '+ Load next page'}
					</button>
				)}
				{!isLoading && !hasNextPage && pages.length > 0 && (
					<span style={{ color: '#64748b', fontSize: 13 }}>
						All {totalLoaded} instances loaded
					</span>
				)}
			</div>

			{isLoading ? (
				<p style={{ color: '#64748b' }}>
					Loading page 1 ({apiCallsPerPage} API calls)…
				</p>
			) : (
				<InstanceTable instances={visibleInstances} />
			)}
		</div>
	);
}

function FindInstanceDemo() {
	const [inputValue, setInputValue] = useState('');
	const [targetId, setTargetId] = useState<string | null>(null);

	const { data, isLoading } = useQuery({
		...findInstance(
			{ MaxResults: 5 },
			targetId != null ? { instanceId: targetId } : undefined,
		),
		enabled: targetId != null,
	});

	const found =
		targetId != null ? data?.find(i => i.InstanceId === targetId) : undefined;
	const apiCalls = data ? Math.ceil(data.length / 5) : 0;

	function handleFind() {
		const n = parseInt(inputValue, 10);
		if (!isNaN(n) && n >= 1 && n <= 95)
			setTargetId(`i-${String(n).padStart(4, '0')}`);
	}

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				<code style={{ background: 'rgb(15, 23, 42)' }}>
					shouldFetchNextPage
				</code>{' '}
				stops the crawl the moment the target instance appears. Each target ID
				gets its own cache entry — re-searching the same ID costs zero API
				calls.
			</p>
			<CodeSnippet
				code={`const findInstance = queryFactory(describeInstances, {
  queryKey: ['find'],
  // queryFn, getNextPageParam, initialPageParam, reduce all inherited
  shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
    opts.instanceId != null && !instances?.some(i => i.InstanceId === opts.instanceId),
});

useQuery({ ...findInstance({ MaxResults: 5 }, { instanceId }), enabled: !!instanceId })`}
			/>

			<div
				style={{
					display: 'flex',
					gap: 8,
					marginBottom: 20,
					alignItems: 'center',
				}}
			>
				<input
					type="number"
					min={1}
					max={95}
					placeholder="Instance # (1–95)"
					value={inputValue}
					onChange={e => setInputValue(e.target.value)}
					onKeyDown={e => e.key === 'Enter' && handleFind()}
					style={{
						padding: '7px 12px',
						borderRadius: 8,
						border: '1px solid #334155',
						fontSize: 14,
						width: 160,
						background: '#0f172a',
						color: '#e2e8f0',
					}}
				/>
				<button onClick={handleFind} style={btn()}>
					Find
				</button>
				{targetId != null && (
					<span style={{ color: '#64748b', fontSize: 13 }}>
						{isLoading
							? `Crawling until ${targetId} is found…`
							: found
								? `Found after ${apiCalls} API call${apiCalls !== 1 ? 's' : ''} · ${data!.length} instances scanned`
								: `${targetId} not found`}
					</span>
				)}
			</div>

			{targetId != null && !isLoading && data && data.length > 0 && (
				<>
					<div style={{ marginBottom: 12 }}>
						<Badge>
							{found
								? `${targetId} — found on API call ${apiCalls}`
								: `Exhausted all pages — ${targetId} not found`}
						</Badge>
					</div>
					<InstanceTable instances={data} highlightId={targetId} />
					{!found && (
						<p style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>
							All {data.length} instances scanned, target not found.
						</p>
					)}
				</>
			)}
		</div>
	);
}

function InvalidationDemo() {
	const queryClient = useQueryClient();
	const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());

	const { data, isLoading, isFetching } = useQuery(
		describeInstances({ MaxResults: 20 }),
	);

	const { mutate: stopInstance } = useMutation({
		mutationFn: (instanceId: string) =>
			ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] })),
		onSuccess: (_data, instanceId) => {
			setStoppingIds(prev => {
				const next = new Set(prev);
				next.delete(instanceId);
				return next;
			});
			void queryClient.invalidateQueries(describeInstances());
		},
	});

	function handleStop(instanceId: string) {
		setStoppingIds(prev => new Set(prev).add(instanceId));
		stopInstance(instanceId);
	}

	const runningCount =
		data?.filter(i => i.State.Name === 'running').length ?? 0;

	return (
		<div>
			<p style={{ color: '#94a3b8', marginBottom: 12, lineHeight: 1.6 }}>
				Calling a factory with no arguments returns just its namespace key.
				Pass that to{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>invalidateQueries</code>{' '}
				and TanStack prefix-matches it against every cache entry under that
				namespace — so one call marks{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>describeInstances</code>
				,{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>runningInstances</code>
				, and{' '}
				<code style={{ background: 'rgb(15, 23, 42)' }}>findInstance</code>{' '}
				stale together. Click Stop on any instance to trigger a write and watch
				all views refetch.
			</p>
			<CodeSnippet
				code={`// After any write that touches EC2 instances:
await queryClient.invalidateQueries(describeInstances())
// describeInstances()  →  { queryKey: ['ec2:DescribeInstances'] }

// TanStack prefix-matches and marks stale:
//   ['ec2:DescribeInstances', ...]          ← describeInstances
//   ['ec2:DescribeInstances', ...]          ← runningInstances (same entry, select differs)
//   ['ec2:DescribeInstances', 'find', ...]  ← findInstance`}
			/>

			{isLoading ? (
				<p style={{ color: '#64748b' }}>Fetching…</p>
			) : (
				<>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							marginBottom: 12,
						}}
					>
						<Badge>{runningCount} running</Badge>
						<Badge>
							{data!.filter(i => i.State.Name === 'stopped').length} stopped
						</Badge>
						{isFetching && (
							<span style={{ color: '#64748b', fontSize: 13 }}>
								refetching…
							</span>
						)}
					</div>
					<InstanceTable
						instances={data!}
						onStop={handleStop}
						stoppingIds={stoppingIds}
					/>
				</>
			)}
		</div>
	);
}

// ── App shell ─────────────────────────────────────────────────────────────────

const DEMOS = [
	{ label: 'Basic', component: BasicDemo },
	{ label: 'Crawling', component: CrawlingDemo },
	{ label: 'Composition', component: CompositionDemo },
	{ label: 'Infinite', component: InfiniteWithCrawlingDemo },
	{ label: 'Early stop', component: FindInstanceDemo },
	{ label: 'Invalidation', component: InvalidationDemo },
];

export default function App() {
	const [activeIdx, setActiveIdx] = useState(0);
	const Demo = DEMOS[activeIdx]!.component;

	return (
		<div
			style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}
		>
			<div style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 20px' }}>
				<div style={{ marginBottom: 28 }}>
					<h1
						style={{
							fontSize: 22,
							fontWeight: 700,
							marginBottom: 4,
							color: '#f1f5f9',
						}}
					>
						react-query-factory
					</h1>
					<p style={{ color: '#64748b', fontSize: 14 }}>
						sandbox — 95 mock EC2 instances · us-east-1
					</p>
				</div>

				<div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
					<nav style={{ width: 148, flexShrink: 0 }}>
						{DEMOS.map((d, i) => (
							<button
								key={d.label}
								onClick={() => setActiveIdx(i)}
								style={{
									display: 'block',
									width: '100%',
									padding: '8px 12px',
									textAlign: 'left',
									background: activeIdx === i ? '#1e3a5f' : 'transparent',
									color: activeIdx === i ? '#93c5fd' : '#64748b',
									borderTop: 'none',
									borderRight: 'none',
									borderBottom: 'none',
									borderLeft: `2px solid ${activeIdx === i ? '#3b82f6' : 'transparent'}`,
									borderRadius: '0 6px 6px 0',
									fontSize: 14,
									fontWeight: activeIdx === i ? 600 : 400,
									cursor: 'pointer',
									transition: 'all 0.1s',
									marginBottom: 2,
								}}
							>
								{d.label}
							</button>
						))}
					</nav>

					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								background: '#1e293b',
								borderRadius: 12,
								border: '1px solid #334155',
								padding: 28,
								minHeight: 380,
							}}
						>
							<h2
								style={{
									fontSize: 17,
									fontWeight: 600,
									marginBottom: 18,
									color: '#f1f5f9',
								}}
							>
								{DEMOS[activeIdx]!.label}
							</h2>
							<Demo />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
