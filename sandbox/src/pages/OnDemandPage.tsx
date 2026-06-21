import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { Instance } from '../aws-sdk-mock.js';
import { describeInstances } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './OnDemandPage.tsx?raw';
import {
  Box,
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
import {
  CodeBlock,
  INSTANCE_COLUMN_DEFS,
  PAGE_SIZE_OPTIONS,
  RefreshButton,
} from '../shared.js';

export const handle = { label: 'On demand', source: pageSource };

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

function OnDemandPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [preferences, setPreferences] = useState({ pageSize: 20 });
  const { pageSize } = preferences;
  const apiCallsPerPage = Math.ceil(pageSize / SERVER_PAGE_SIZE);

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

  const pages = (data?.pages ?? []) as Instance[][];
  const currentItems = pages[currentPage - 1] ?? [];
  const pagesCount = pages.length + (hasNextPage ? 1 : 0);
  const totalLoaded = pages.reduce((n, p) => n + p.length, 0);

  function handlePageChange(page: number) {
    if (page > pages.length && hasNextPage) {
      void fetchNextPage().then(() => setCurrentPage(page));
    } else {
      setCurrentPage(page);
    }
  }

  const { items, filterProps, collectionProps } = useCollection(currentItems, {
    filtering: {},
    sorting: {},
  });

  const factoryCode = `\
// Each UI page = one fetchNextPage() call = ${apiCallsPerPage} API calls (${SERVER_PAGE_SIZE} items each).
// TanStack manages virtual pages; the factory handles the per-page crawl.
useInfiniteQuery(
  describeInstances.infinite(
    { MaxResults: ${SERVER_PAGE_SIZE} },         // server page size
    { minResults: ${pageSize} },         // crawl until this many items are in the page
  )
)
// data.pages → Instance[][]  (one flat array per UI page)`;

  return (
    <SpaceBetween size="m">
      <TextContent>
        <p>
          AWS pagination is server-driven: <code>MaxResults</code> caps each API
          call, but the server may return fewer items regardless. When a UI page
          needs 20 rows but the server only gives 5 at a time, traditional
          infinite query setups leave the user with ragged pages unless you add
          a manual crawl loop between <code>fetchNextPage</code> calls. This
          factory&#39;s <code>shouldFetchNextPage</code> accepts a per-call{' '}
          <code>minResults</code> option that drives exactly that loop
          internally — each virtual page accumulates API responses until it
          reaches the target count, then hands off a complete, uniform page to
          the UI. The UX benefit is consistent page sizes: users advance
          pagination at their own pace, and each page arrives fully-formed.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={factoryCode} />
      </ExpandableSection>
      <Table
        stripedRows
        {...collectionProps}
        loading={isLoading}
        loadingText={`Loading page 1 (${apiCallsPerPage} API calls)…`}
        items={items}
        columnDefinitions={INSTANCE_COLUMN_DEFS}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder="Search current page…"
          />
        }
        pagination={
          <Pagination
            currentPageIndex={currentPage}
            pagesCount={pagesCount || 1}
            openEnd={!!hasNextPage}
            onChange={({ detail }) => handlePageChange(detail.currentPageIndex)}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={preferences}
            onConfirm={({ detail }) => {
              setPreferences(detail as typeof preferences);
              setCurrentPage(1);
            }}
            pageSizePreference={{
              title: 'Items per page',
              options: PAGE_SIZE_OPTIONS,
            }}
          />
        }
        header={
          <Header
            variant="h2"
            counter={totalLoaded > 0 ? `(${totalLoaded} loaded)` : undefined}
            description={`${apiCallsPerPage} API call${apiCallsPerPage !== 1 ? 's' : ''} per page · server page size: ${SERVER_PAGE_SIZE}`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                {isFetchingNextPage && (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Spinner />
                    <Box>Crawling next page…</Box>
                  </SpaceBetween>
                )}
                <RefreshButton
                  onClick={() => refetch()}
                  loading={isFetching && !isFetchingNextPage}
                />
              </SpaceBetween>
            }
          >
            Instances — infinite pagination
          </Header>
        }
        trackBy="InstanceId"
        empty={isLoading ? undefined : <Box>No instances</Box>}
      />
    </SpaceBetween>
  );
}

export { OnDemandPage as Component };
