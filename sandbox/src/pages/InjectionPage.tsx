import { createContext, useContext, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { InstanceTypeInfo } from '../aws-sdk-mock.js';
import { EC2Client } from '../aws-sdk-mock.js';
import { describeInstanceTypesWithClient, ec2 } from '../queries.js';
import pageSource from './InjectionPage.tsx?raw';
import {
  Box,
  ExpandableSection,
  Header,
  Pagination,
  SpaceBetween,
  StatusIndicator,
  Table,
  TextContent,
  TextFilter,
} from '@cloudscape-design/components';
import { CodeBlock, RefreshButton } from '../shared.js';

export const handle = { label: 'Dependency injection', source: pageSource };

const FACTORY_CODE = `\
// The EC2 client is a non-serializable runtime dependency — it comes from
// React context, not module scope. Declare it as the third queryFn argument:
const describeInstanceTypes = queryFactory({
  queryKey: ['ec2:DescribeInstanceTypes'], // ← natural key, no DI artifact in it
  queryFn: (_: void, ctx, deps: { client: EC2Client }) =>
    deps.client.send(new DescribeInstanceTypesCommand({ MaxResults: 100 }), {
      abortSignal: ctx.signal,
    }),
});

// The factory now requires .inject() before the options can reach useQuery —
// this is a COMPILE error, and the client never lands in the query key:
//   useQuery(describeInstanceTypes());  // ❌ Type error

// Supply the dependency at the call site (useSuspenseQuery → data, never undefined):
const client = useContext(EC2ClientContext);
const { data } = useSuspenseQuery(
  describeInstanceTypes().inject({ client }),
);
// query key stays ['ec2:DescribeInstanceTypes']`;

// A non-serializable dependency provided the idiomatic React way: via context.
const EC2ClientContext = createContext<EC2Client>(ec2);

function InstanceTypesTable() {
  const client = useContext(EC2ClientContext);
  const [pageSize] = useState(10);

  // .inject(deps) is required by the type — the client reaches the queryFn but
  // never the query key. useSuspenseQuery → data is never undefined.
  const { data, isFetching, refetch } = useSuspenseQuery(
    describeInstanceTypesWithClient().inject({ client }),
  );

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(data.InstanceTypes ?? [], {
      filtering: {},
      pagination: { pageSize },
      sorting: {},
    });

  return (
    <Table
      stripedRows
      {...collectionProps}
      items={items}
      columnDefinitions={[
        {
          id: 'type',
          header: 'Instance type',
          cell: (t: InstanceTypeInfo) => (
            <Box variant="code">{t.InstanceType}</Box>
          ),
        },
        {
          id: 'vcpu',
          header: 'vCPU',
          cell: (t: InstanceTypeInfo) => t.VCpuInfo?.DefaultVCpus,
        },
        {
          id: 'memory',
          header: 'Memory',
          cell: (t: InstanceTypeInfo) =>
            `${((t.MemoryInfo?.SizeInMiB ?? 0) / 1024).toFixed(1)} GiB`,
        },
        {
          id: 'generation',
          header: 'Generation',
          cell: (t: InstanceTypeInfo) => (
            <StatusIndicator type={t.CurrentGeneration ? 'success' : 'warning'}>
              {t.CurrentGeneration ? 'current' : 'previous'}
            </StatusIndicator>
          ),
        },
      ]}
      filter={<TextFilter {...filterProps} filteringPlaceholder="Find type…" />}
      pagination={<Pagination {...paginationProps} />}
      header={
        <Header
          variant="h2"
          counter={`(${data.InstanceTypes?.length ?? 0})`}
          actions={
            <RefreshButton onClick={() => refetch()} loading={isFetching} />
          }
        >
          Instance Types
        </Header>
      }
      trackBy="InstanceType"
    />
  );
}

function InjectionPage() {
  return (
    // In a real app this provider sits near the root and supplies a configured,
    // per-session client (auth, region, base URL…) — exactly the kind of thing
    // that must not appear in a cache key.
    <EC2ClientContext.Provider value={ec2}>
      <SpaceBetween size="m">
        <TextContent>
          <p>
            Some <code>queryFn</code> inputs are not serializable and must not
            be part of the query key — an API client from context, an auth
            token, a translator. Putting them in the key would leak them into
            the cache and devtools, and bust the cache whenever they change
            identity.
          </p>
          <p>
            Declare such inputs as the <strong>third</strong> argument to{' '}
            <code>queryFn</code> (a <code>deps</code> bag). The factory call
            then returns a pending object that requires{' '}
            <code>.inject(deps)</code> before it can reach <code>useQuery</code>{' '}
            — enforced by the type system — and the deps reach your{' '}
            <code>queryFn</code> (and <code>select</code>) while staying out of
            the query key entirely. Here the key is simply{' '}
            <code>['ec2:DescribeInstanceTypes']</code>; the injected client
            never appears in it. The bare call still exposes the real{' '}
            <code>queryKey</code>, so <code>invalidateQueries</code> works
            without supplying deps.
          </p>
        </TextContent>
        <ExpandableSection headerText="Factory code" variant="container">
          <CodeBlock code={FACTORY_CODE} />
        </ExpandableSection>
        <InstanceTypesTable />
      </SpaceBetween>
    </EC2ClientContext.Provider>
  );
}

export { InjectionPage as Component };
