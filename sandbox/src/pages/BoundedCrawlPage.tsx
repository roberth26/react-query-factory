import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { findInstance } from '../queries.js';
import {
	Button,
	CollectionPreferences,
	Container,
	ExpandableSection,
	FormField,
	Header,
	Input,
	Pagination,
	SpaceBetween,
	StatusIndicator,
	Table,
	TextContent,
} from '@cloudscape-design/components';
import pageSource from './BoundedCrawlPage.tsx?raw';
import { CodeBlock, INSTANCE_COLUMN_DEFS, PAGE_SIZE_OPTIONS } from '../shared.js';

export const handle = { label: 'Bounded crawl', source: pageSource };

const FACTORY_CODE = `\
const findInstance = queryFactory(describeInstances, {
  queryKey: ['find'],
  // queryFn, getNextPageParam, initialPageParam, reduce — all inherited
  shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
    opts.instanceId != null && !instances.some(i => i.InstanceId === opts.instanceId),
});

// Crawl stops the moment the target appears — or exhausts all pages.
// Re-searching the same ID costs zero API calls (cache hit).
useQuery({ ...findInstance({ MaxResults: 5 }, { instanceId }), enabled: !!instanceId })`;

export async function loader() {
	return null;
}

function BoundedCrawlPage() {
	const [input, setInput] = useState('');
	const [targetId, setTargetId] = useState<string | undefined>(undefined);
	const [preferences, setPreferences] = useState({ pageSize: 10 });

	const { data, isLoading, isFetching } = useQuery({
		...findInstance({ MaxResults: 5 }, { instanceId: targetId }),
		enabled: targetId != null,
	});

	const found = data?.find(i => i.InstanceId === targetId);
	const apiCalls = data ? Math.ceil(data.length / 5) : 0;

	const { items, paginationProps, collectionProps } = useCollection(
		data ?? [],
		{ pagination: { pageSize: preferences.pageSize }, sorting: {} },
	);

	function handleSearch() {
		const n = parseInt(input, 10);
		if (!isNaN(n) && n >= 1 && n <= 95)
			setTargetId(`i-${String(n).padStart(8, '0')}`);
	}

	return (
		<SpaceBetween size="m">
			<TextContent>
				<p>
					The AWS EC2 API has no server-side lookup by instance ID — finding a specific instance
					requires scanning pages sequentially until it appears. An exhaustive crawl wastes API
					calls when the target is near the beginning of the result set.{' '}
					<code>queryFactory</code> supports child factories that inherit the parent&#39;s{' '}
					<code>queryFn</code>, <code>reduce</code>, and pagination config while overriding only{' '}
					<code>shouldFetchNextPage</code>. Here, <code>findInstance</code> stops the moment the
					target instance ID appears in the accumulated results. Re-searching the same ID is free
					— TanStack Query serves it from cache. The UX implication is a fast, cache-aware search:
					early results arrive with minimal API traffic, and repeat queries never touch the
					network.
				</p>
			</TextContent>
<ExpandableSection headerText="Factory code" variant="container">
				<CodeBlock code={FACTORY_CODE} />
			</ExpandableSection>
			<Container
				header={
					<Header variant="h2" description="Crawl stops the moment the target instance is found. Re-searching the same ID costs zero API calls.">
						Find instance by number (1–95)
					</Header>
				}
			>
				<SpaceBetween size="m">
					<FormField label="Instance number">
						<SpaceBetween direction="horizontal" size="xs">
							<Input
								type="number"
								value={input}
								onChange={({ detail }) => setInput(detail.value)}
								onKeyDown={e => e.detail.key === 'Enter' && handleSearch()}
								placeholder="1–95"
							/>
							<Button onClick={handleSearch} loading={isLoading || isFetching}>
								Find
							</Button>
						</SpaceBetween>
					</FormField>
					{targetId != null &&
						!isLoading &&
						(found ? (
							<StatusIndicator type="success">
								Found {targetId} after {apiCalls} API call
								{apiCalls !== 1 ? 's' : ''} · {data!.length} instances scanned
							</StatusIndicator>
						) : data != null ? (
							<StatusIndicator type="error">
								Not found — all {data.length} instances scanned
							</StatusIndicator>
						) : null)}
				</SpaceBetween>
			</Container>
			{data && data.length > 0 && (
				<Table
					stripedRows
					{...collectionProps}
					items={items}
					columnDefinitions={[...INSTANCE_COLUMN_DEFS]}
					pagination={<Pagination {...paginationProps} />}
					preferences={
						<CollectionPreferences
							title="Preferences"
							confirmLabel="Confirm"
							cancelLabel="Cancel"
							preferences={preferences}
							onConfirm={({ detail }) =>
								setPreferences(detail as typeof preferences)
							}
							pageSizePreference={{
								title: 'Page size',
								options: PAGE_SIZE_OPTIONS,
							}}
						/>
					}
					header={
						<Header variant="h2" counter={`(${data.length} scanned)`}>
							Scanned instances
						</Header>
					}
					trackBy="InstanceId"
				/>
			)}
		</SpaceBetween>
	);
}

export { BoundedCrawlPage as Component };
