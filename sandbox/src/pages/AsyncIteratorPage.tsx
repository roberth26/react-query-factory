import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { describeInstancesViaPaginator } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './AsyncIteratorPage.tsx?raw';
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
} from '../shared.js';

export const handle = { label: 'Async iterator', source: pageSource };

const FACTORY_CODE = `\
// Async iterator queryFn — composed from describeInstances, overrides queryFn only.
// shouldFetchNextPage, reduce, initialPageParam, and the crawl key are all inherited.
// getNextPageParam and initialPageParam are not required for useQuery (crawl) mode —
// the iterator manages its own cursor. Add them if you need .infinite() for
// user-driven server pagination via useInfiniteQuery.
const describeInstancesViaPaginator = queryFactory(describeInstances, {
  queryKey: ['paginator'],
  queryFn: (params: DescribeInstancesRequest, ctx) =>
    paginateDescribeInstances(
      { client: ec2, pageSize: params.MaxResults, startingToken: ctx.pageParam ?? params.NextToken },
      params,
    ),
});
`;

export async function loader() {
  const options = describeInstancesViaPaginator(
    { MaxResults: 20 },
    { minResults: Number.MAX_SAFE_INTEGER },
  );
  await queryClient.prefetchQuery(options);
  return options;
}

function AsyncIteratorPage() {
  const options = useLoaderData<Awaited<ReturnType<typeof loader>>>();
  const [preferences, setPreferences] = useState({ pageSize: 20 });

  const { data, isLoading } = useQuery(options);

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(data ?? [], {
      filtering: {},
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
    });

  return (
    <SpaceBetween size="m">
      <TextContent>
        <p>
          When a <code>queryFn</code> returns an <code>AsyncIterable</code>, the
          factory detects it and drives the crawl with{' '}
          <code>for await...of</code>, calling <code>shouldFetchNextPage</code>{' '}
          after each yielded item to decide whether to keep going. The iterator
          owns cursor management, so <code>getNextPageParam</code> and{' '}
          <code>initialPageParam</code> are not needed for <code>useQuery</code>{' '}
          crawl mode. They are required for <code>.infinite()</code> if you want
          user-driven server pagination via <code>useInfiniteQuery</code>. AWS
          SDK v3 paginator functions — <code>paginateDescribeInstances</code>{' '}
          and its equivalents — return async iterables and plug in directly. Any
          other source of <code>AsyncIterable&lt;TPage&gt;</code> works the same
          way.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={FACTORY_CODE} />
      </ExpandableSection>
      <Table
        stripedRows
        {...collectionProps}
        loading={isLoading}
        loadingText="Crawling via paginator…"
        items={items}
        columnDefinitions={INSTANCE_COLUMN_DEFS}
        filter={
          <TextFilter
            {...filterProps}
            filteringPlaceholder="Search instances…"
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
          <Header variant="h2" counter={data ? `(${data.length})` : undefined}>
            Instances — async iterator crawl
          </Header>
        }
        trackBy="InstanceId"
      />
    </SpaceBetween>
  );
}

export { AsyncIteratorPage as Component };
