import { useState, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { Instance } from '../aws-sdk-mock.js';
import { describeInstances } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './RenderWhileCrawlingPage.tsx?raw';
import {
  CollectionPreferences,
  ExpandableSection,
  Header,
  Pagination,
  SpaceBetween,
  Table,
  TextContent,
  TextFilter,
} from '@cloudscape-design/components';
import {
  CodeBlock,
  INSTANCE_COLUMN_DEFS,
  PAGE_SIZE_OPTIONS,
  RefreshButton,
} from '../shared.js';

export const handle = { label: 'Render-while-crawling', source: pageSource };

const SERVER_PAGE_SIZE = 5;

export async function loader() {
  await queryClient.prefetchInfiniteQuery(
    describeInstances.infinite(
      { MaxResults: SERVER_PAGE_SIZE },
      { minResults: 20 },
    ),
  );
  return null;
}

function RenderWhileCrawlingPage() {
  const [preferences, setPreferences] = useState({ pageSize: 20 });
  const { pageSize } = preferences;
  const apiCallsPerBatch = Math.ceil(pageSize / SERVER_PAGE_SIZE);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(
    describeInstances.infinite(
      { MaxResults: SERVER_PAGE_SIZE },
      { minResults: pageSize },
    ),
  );

  const factoryCode = `\
// minResults matches the UI page size — each virtual page crawls until it's full.
// With a server page size of ${SERVER_PAGE_SIZE} and minResults of ${pageSize}, each batch = ${apiCallsPerBatch} API call${apiCallsPerBatch !== 1 ? 's' : ''}.
const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
  describeInstances.infinite({ MaxResults: ${SERVER_PAGE_SIZE} }, { minResults: ${pageSize} }),
);

useEffect(() => {
  if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

// data.pages.flat() streams in ${pageSize}-item batches: [] → [1–${pageSize}] → [1–${pageSize * 2}] → … → [1–95]`;

  // minResults = pageSize ensures each virtual page is fully filled before rendering.
  // The crawling machinery fetches additional API pages when the server returns fewer
  // items than MaxResults, then auto-advances to the next batch.
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
          When results need to appear progressively rather than all at once,
          render-while-crawling streams data into the UI as each batch arrives.{' '}
          <code>minResults</code> is set to the UI page size so each virtual
          page crawls as many API calls as needed to accumulate a full batch
          before triggering a render. If the server returns fewer items than{' '}
          <code>MaxResults</code>, the crawling machinery fetches more
          automatically. A <code>useEffect</code> auto-advances to the next
          virtual page the moment the previous one completes. Unlike{' '}
          <strong>Crawl-then-render</strong>, users see rows immediately. Unlike{' '}
          <strong>On demand</strong>, no user interaction is needed.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={factoryCode} />
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
            actions={
              <RefreshButton
                onClick={() => refetch()}
                loading={isStreaming || isFetching}
              />
            }
          >
            Instances — render-while-crawling
          </Header>
        }
        trackBy="InstanceId"
      />
    </SpaceBetween>
  );
}

export { RenderWhileCrawlingPage as Component };
