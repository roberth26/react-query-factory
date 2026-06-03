import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import { queryFactory } from 'react-query-factory';
import type { DescribeInstancesResult, Instance } from '../aws-sdk-mock.js';
import { paginateDescribeInstances } from '../aws-sdk-mock.js';
import { ec2 } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './PaginatorPage.tsx?raw';
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

const describeInstancesViaPaginator = queryFactory({
  queryKey: ['ec2:DescribeInstances:paginator'],
  queryFn: (params: { pageSize?: number }) =>
    paginateDescribeInstances(
      { client: ec2, pageSize: params.pageSize ?? 20 },
      {},
    ),
  shouldFetchNextPage: (
    instances: Instance[] | undefined,
    opts: { minResults?: number },
  ) => opts.minResults != null && (instances?.length ?? 0) < opts.minResults,
  reduce: (
    acc: Instance[] | undefined,
    page: DescribeInstancesResult,
  ): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
});

const FACTORY_CODE = `\
// Async iterator queryFn — no getNextPageParam, no initialPageParam, no cursor threading.
// The iterator manages its own cursor; the factory just walks it with for await...of.
// AWS SDK v3 paginator functions return async iterables and work here directly.
const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params) =>
    paginateDescribeInstances({ client: ec2, pageSize: params.pageSize }, {}),
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults != null && instances.length < opts.minResults,
  reduce: (acc, page: DescribeInstancesResult): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
});

// Compare with the cursor-based equivalent — three extra fields required:
const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params, ctx) =>
    ec2.send(new DescribeInstancesCommand({ ...params, NextToken: ctx.pageParam ?? params.NextToken })),
  getNextPageParam: r => r.NextToken,                // ← not needed with async iterator
  initialPageParam: undefined as string | undefined, // ← not needed with async iterator
  shouldFetchNextPage: ...,
  reduce: ...,
});`;

export async function loader() {
  await queryClient.prefetchQuery(
    describeInstancesViaPaginator(
      { pageSize: 20 },
      { minResults: Number.MAX_SAFE_INTEGER },
    ),
  );
  return null;
}

function PaginatorPage() {
  const [preferences, setPreferences] = useState({ pageSize: 20 });

  const { data, isLoading } = useQuery(
    describeInstancesViaPaginator(
      { pageSize: 20 },
      { minResults: Number.MAX_SAFE_INTEGER },
    ),
  );

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
          owns cursor management, so <code>getNextPageParam</code>,{' '}
          <code>initialPageParam</code>, and token threading are not required.
          AWS SDK v3 paginator functions —{' '}
          <code>paginateDescribeInstances</code> and its equivalents — return
          async iterables and plug in directly. Any other source of{' '}
          <code>AsyncIterable&lt;TPage&gt;</code> works the same way.
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

export { PaginatorPage as Component };
