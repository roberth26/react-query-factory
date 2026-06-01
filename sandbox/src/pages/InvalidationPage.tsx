import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type { Instance } from '../aws-sdk-mock.js';
import { StopInstancesCommand } from '../aws-sdk-mock.js';
import { ec2, describeInstances, runningInstances } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './InvalidationPage.tsx?raw';
import {
  Button,
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
} from '../shared.js';
import { useNotifications } from '../notifications.js';

export const handle = { label: 'Invalidation', source: pageSource };

const FACTORY_CODE = `\
// Child keys: [...parentNS, params, ...childSegments]
// → parent(params) is always a prefix of child(params) for the same params.

// Broad — zero-arg returns the namespace; busts every variant, every param set:
await queryClient.invalidateQueries(describeInstances())
// → ['ec2:DescribeInstances']  prefix-matches:
//     ['ec2:DescribeInstances', ...]              ← all describeInstances entries
//     ['ec2:DescribeInstances', ...]              ← runningInstances (same cache entry)
//     ['ec2:DescribeInstances', params, 'find', ...]  ← findInstance

// Scoped — parent with params; busts only that param set and its children:
await queryClient.invalidateQueries(describeInstances({ MaxResults: 20 }))
// → ['ec2:DescribeInstances', { MaxResults: 20 }]  prefix-matches:
//     ['ec2:DescribeInstances', { MaxResults: 20 }]          ← describeInstances
//     ['ec2:DescribeInstances', { MaxResults: 20 }]          ← runningInstances
//     ['ec2:DescribeInstances', { MaxResults: 20 }, 'find', ...]  ← findInstance`;

export async function loader() {
  await Promise.all([
    queryClient.prefetchQuery(describeInstances({ MaxResults: 20 })),
    queryClient.prefetchQuery(runningInstances({ MaxResults: 20 })),
  ]);
  return null;
}

function InvalidationPage() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState({ pageSize: 20 });

  const { data, isLoading, isFetching } = useQuery(
    describeInstances({ MaxResults: 20 }),
  );
  const { data: running } = useQuery(runningInstances({ MaxResults: 20 }));

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
    useCollection(data ?? [], {
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
          Mutations like <code>StopInstances</code> don&#39;t update TanStack
          Query&#39;s cache automatically — you must invalidate the relevant
          queries after a successful response. With raw <code>useQuery</code>,
          keeping every related key in sync across multiple mutation handlers is
          tedious and fragile: add a new derived query and you must remember to
          add its key to every <code>onSuccess</code>. The factory solves this
          at two levels of precision. <strong>Broad:</strong> calling with no
          arguments returns the namespace key — a single{' '}
          <code>invalidateQueries(describeInstances())</code> marks every
          variant, every param set, and every child factory stale
          simultaneously. <strong>Scoped:</strong> child keys are ordered{' '}
          <code>[...parentNS, params, ...childSegments]</code>, so the parent
          called with params is always a prefix of its children for those same
          params — <code>invalidateQueries(describeInstances(params))</code>{' '}
          busts only the queries for that specific call site, leaving unrelated
          cache entries untouched.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={FACTORY_CODE} />
      </ExpandableSection>
      <Table
        stripedRows
        {...collectionProps}
        loading={isLoading}
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
            counter={
              data
                ? `(${running?.length ?? '?'} running / ${data.length} total)`
                : undefined
            }
            description="Stopping an instance uses broad invalidation here — but the same pattern supports scoped invalidation to a single param set. See the factory code snippet."
            actions={isFetching && !isLoading ? <Spinner /> : undefined}
          >
            Instances — stop &amp; invalidate
          </Header>
        }
        trackBy="InstanceId"
      />
    </SpaceBetween>
  );
}

export { InvalidationPage as Component };
