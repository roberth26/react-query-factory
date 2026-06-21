import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { Instance } from '../aws-sdk-mock.js';
import { StopInstancesCommand } from '../aws-sdk-mock.js';
import {
  ec2,
  describeInstances,
  runningInstances,
  stoppedInstances,
} from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './CompositionPage.tsx?raw';
import {
  Box,
  Button,
  ColumnLayout,
  CollectionPreferences,
  Container,
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
import { useNotifications } from '../notifications.js';

export const handle = { label: 'Composition', source: pageSource };

const FACTORY_CODE = `\
// runningInstances and stoppedInstances are child factories of describeInstances.
// They share the same underlying cache entry — one API crawl populates all three.
// Invalidating the parent cascades to every derived query instantly.
const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'running'),
});
const stoppedInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'stopped'),
});

// All three share one cache entry — useSuspenseQuery → data is never undefined.
const { data: all }     = useSuspenseQuery(describeInstances({ MaxResults: 20 }));
const { data: running } = useSuspenseQuery(runningInstances({ MaxResults: 20 }));
const { data: stopped } = useSuspenseQuery(stoppedInstances({ MaxResults: 20 }));

// One invalidation updates all three views:
queryClient.invalidateQueries(describeInstances())`;

export async function loader() {
  const options = describeInstances({ MaxResults: 20 });
  await queryClient.prefetchQuery(options);
  return options;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="h1">{value}</Box>
    </div>
  );
}

function CompositionPage() {
  const options = useLoaderData<Awaited<ReturnType<typeof loader>>>();
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState({ pageSize: 20 });

  const { data: all, isFetching, refetch } = useSuspenseQuery(options);
  const { data: running } = useSuspenseQuery(
    runningInstances({ MaxResults: 20 }),
  );
  const { data: stopped } = useSuspenseQuery(
    stoppedInstances({ MaxResults: 20 }),
  );

  const { mutate: stopInstance } = useMutation({
    mutationFn: (instanceId: string) =>
      ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] })),
    onSuccess: (_result, instanceId) => {
      setStoppingIds(prev => {
        const s = new Set(prev);
        s.delete(instanceId);
        return s;
      });
      addNotification({
        id: instanceId,
        type: 'success',
        content: `Instance ${instanceId} stopped successfully.`,
      });
      void queryClient.invalidateQueries(describeInstances());
    },
  });

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(all, {
      filtering: {},
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
    });

  const stopColumnDef = {
    id: 'stop',
    header: '',
    cell: (inst: Instance) =>
      inst.State.Name === 'running' ? (
        <Button
          variant="inline-link"
          onClick={() => {
            setStoppingIds(prev => new Set(prev).add(inst.InstanceId));
            stopInstance(inst.InstanceId);
          }}
          loading={stoppingIds.has(inst.InstanceId)}
          disabled={stoppingIds.has(inst.InstanceId)}
        >
          Stop
        </Button>
      ) : null,
  };

  return (
    <SpaceBetween size="m">
      <TextContent>
        <p>
          A common dashboard pattern requires multiple views of the same
          underlying data: a total count, a running count, a stopped count — all
          from the same API. Without this library you either make redundant API
          calls for each view, or manually thread a single response through
          multiple pieces of state. Child factories solve this by inheriting the
          parent's <code>queryFn</code>, pagination, and <code>reduce</code>{' '}
          config while applying a <code>select</code> transform on the
          accumulated result. Crucially, all child factories share the same
          underlying cache entry as the parent — one API crawl populates every
          derived view. When the parent is invalidated, all children re-fetch
          together. The UX consequence is a dashboard that stays in sync
          automatically: stopping an instance updates the summary counts and the
          table in a single re-fetch, with no extra coordination.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={FACTORY_CODE} />
      </ExpandableSection>
      <Container header={<Header variant="h2">Instance summary</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <Stat label="Total" value={all.length} />
          <Stat label="Running" value={running.length} />
          <Stat label="Stopped" value={stopped.length} />
        </ColumnLayout>
      </Container>
      <Table
        stripedRows
        {...collectionProps}
        items={items}
        columnDefinitions={[...INSTANCE_COLUMN_DEFS, stopColumnDef]}
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
          <Header
            variant="h2"
            counter={`(${all.length})`}
            description="Stop an instance — the summary counts above update automatically."
            actions={
              <RefreshButton onClick={() => refetch()} loading={isFetching} />
            }
          >
            All instances
          </Header>
        }
        trackBy="InstanceId"
      />
    </SpaceBetween>
  );
}

export { CompositionPage as Component };
