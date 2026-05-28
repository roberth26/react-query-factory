import { useState, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { Instance } from '../aws-sdk-mock.js';
import { describeInstances } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './ExhaustiveCrawlPage.tsx?raw';
import {
	CollectionPreferences,
	ExpandableSection,
	Header,
	Pagination,
	SpaceBetween,
	Spinner,
	Table,
	TextContent,
	TextFilter,
} from '@cloudscape-design/components';
import { CodeBlock, INSTANCE_COLUMN_DEFS, PAGE_SIZE_OPTIONS } from '../shared.js';

export const handle = { label: 'Exhaustive crawl', source: pageSource };

const FACTORY_CODE = `\
// minResults: 1 → shouldFetchNextPage returns false after the first API call.
// Each fetchNextPage() = one server page. Auto-advance drives the full crawl.
const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
  describeInstances.infinite({ MaxResults: 20 }, { minResults: 1 }),
);

useEffect(() => {
  if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

// data.pages.flat() streams: [] → [1–20] → [1–40] → … → [1–95]`;

export async function loader() {
	await queryClient.prefetchInfiniteQuery(
		describeInstances.infinite({ MaxResults: 20 }, { minResults: 1 }),
	);
	return null;
}

function ExhaustiveCrawlPage() {
	const [preferences, setPreferences] = useState({ pageSize: 20 });

	const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
		useInfiniteQuery(describeInstances.infinite({ MaxResults: 20 }, { minResults: 1 }));

	// minResults: 1 means each fetchNextPage() = exactly one server API call.
	// Auto-advance as soon as the previous page lands.
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) {
			void fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const allInstances = (data?.pages ?? []).flat() as Instance[];
	const isStreaming = hasNextPage || isFetchingNextPage;

	const { items, filterProps, paginationProps, collectionProps } =
		useCollection(allInstances, {
			filtering: {},
			pagination: { pageSize: preferences.pageSize },
			sorting: {},
		});

	return (
		<SpaceBetween size="m">
			<TextContent>
				<p>
					When you need to search or filter across the full dataset, you have two strategies:
					block rendering until the crawl is complete ("crawl-then-render"), or render each
					page as it arrives and keep updating ("render-while-crawling"). The{' '}
					<strong>Crawl for dropdown</strong> demo uses the first strategy because a partial
					option list is worse than no list. This demo uses the second: an infinite query
					where <code>minResults: 1</code> keeps each virtual page to exactly one server
					response, and a <code>useEffect</code> auto-advances to the next page the moment
					the previous one lands. The factory&#39;s crawl machinery isn&#39;t needed here —
					what matters is that each page delivers a render. The UX tradeoff: users see rows
					immediately, but the search may miss instances that haven&#39;t loaded yet.
				</p>
			</TextContent>
<ExpandableSection headerText="Factory code" variant="container">
				<CodeBlock code={FACTORY_CODE} />
			</ExpandableSection>
			<Table
				stripedRows
				{...collectionProps}
				loading={isLoading}
				loadingText="Loading first page…"
				items={items}
				columnDefinitions={INSTANCE_COLUMN_DEFS}
				filter={
					<TextFilter
						{...filterProps}
						filteringPlaceholder="Search loaded instances…"
						countText={
							filterProps.filteringText
								? `${items.length} match${items.length !== 1 ? 'es' : ''}`
								: undefined
						}
					/>
				}
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
					<Header
						variant="h2"
						counter={
							allInstances.length > 0
								? `(${allInstances.length}${isStreaming ? '…' : ' / 95'})`
								: undefined
						}
						description={
							isStreaming
								? 'Streaming — search spans only instances loaded so far'
								: 'All 95 instances loaded — search spans the full dataset'
						}
						actions={isStreaming ? <Spinner /> : undefined}
					>
						Instances — exhaustive crawl
					</Header>
				}
				trackBy="InstanceId"
			/>
		</SpaceBetween>
	);
}

export { ExhaustiveCrawlPage as Component };
