import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { AvailabilityZone } from '../aws-sdk-mock.js';
import { describeAvailabilityZones } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './BasicPage.tsx?raw';
import {
  Box,
  CollectionPreferences,
  ExpandableSection,
  Header,
  Pagination,
  SpaceBetween,
  StatusIndicator,
  Table,
  TextContent,
  TextFilter,
} from '@cloudscape-design/components';
import { CodeBlock, PAGE_SIZE_OPTIONS, RefreshButton } from '../shared.js';

export const handle = { label: 'Basic', source: pageSource };

const FACTORY_CODE = `\
const describeAvailabilityZones = queryFactory({
  queryKey: ['ec2:DescribeAvailabilityZones'],
  queryFn: (_: void, ctx) =>
    ec2.send(new DescribeAvailabilityZonesCommand(), { abortSignal: ctx.signal }),
});

// useSuspenseQuery → data is AvailabilityZonesResult, never undefined
const { data } = useSuspenseQuery(describeAvailabilityZones());
// data.AvailabilityZones → AvailabilityZone[]  (single API call)`;

export async function loader() {
  const options = describeAvailabilityZones();
  await queryClient.prefetchQuery(options);
  return options;
}

function BasicPage() {
  const options = useLoaderData<Awaited<ReturnType<typeof loader>>>();
  const [preferences, setPreferences] = useState({ pageSize: 10 });
  const { data, isFetching, refetch } = useSuspenseQuery(options);

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(data.AvailabilityZones ?? [], {
      filtering: {},
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
    });

  return (
    <SpaceBetween size="m">
      <TextContent>
        <p>
          <code>DescribeAvailabilityZones</code> returns a single, non-paginated
          response — the simplest shape the AWS SDK produces. This example shows
          the minimal factory: just a <code>queryKey</code> and a{' '}
          <code>queryFn</code>, with no pagination or accumulation options
          needed. Before this library, even simple queries required boilerplate
          to wire up a consistent cache key and typed parameters. The factory
          encapsulates that once, and every call site gets type-safe options for
          free. From a UX perspective, a single-call query means the table
          either loads instantly or shows a spinner briefly — there is no
          incremental state to manage.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={FACTORY_CODE} />
      </ExpandableSection>
      <Table
        stripedRows
        {...collectionProps}
        items={items}
        columnDefinitions={[
          {
            id: 'zone',
            header: 'Zone',
            cell: (z: AvailabilityZone) => z.ZoneName,
          },
          {
            id: 'id',
            header: 'Zone ID',
            cell: (z: AvailabilityZone) => <Box variant="code">{z.ZoneId}</Box>,
          },
          {
            id: 'state',
            header: 'State',
            cell: (z: AvailabilityZone) => (
              <StatusIndicator
                type={z.State === 'available' ? 'success' : 'warning'}
              >
                {z.State}
              </StatusIndicator>
            ),
          },
        ]}
        filter={
          <TextFilter {...filterProps} filteringPlaceholder="Find zone…" />
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
            counter={`(${data.AvailabilityZones?.length ?? 0})`}
            actions={
              <RefreshButton onClick={() => refetch()} loading={isFetching} />
            }
          >
            Availability Zones
          </Header>
        }
        trackBy="ZoneId"
      />
    </SpaceBetween>
  );
}

export { BasicPage as Component };
