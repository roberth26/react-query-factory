import { CodeView } from '@cloudscape-design/code-view';
import highlight from '@cloudscape-design/code-view/highlight/typescript';
import { Box, StatusIndicator } from '@cloudscape-design/components';
import type { Instance, InstanceState } from './aws-sdk-mock.js';

export const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 rows' },
  { value: 20, label: '20 rows' },
  { value: 50, label: '50 rows' },
];

export function CodeBlock({ code }: { code: string }) {
  return <CodeView content={code.trim()} highlight={highlight} lineNumbers />;
}

export function instanceName(inst: Instance) {
  return inst.Tags?.find(t => t.Key === 'Name')?.Value ?? inst.InstanceId;
}

export function StateIndicator({ state }: { state: InstanceState['Name'] }) {
  const type =
    state === 'running'
      ? 'success'
      : state === 'stopped'
        ? 'stopped'
        : state === 'terminated'
          ? 'error'
          : 'pending';
  return <StatusIndicator type={type}>{state}</StatusIndicator>;
}

export const INSTANCE_COLUMN_DEFS = [
  {
    id: 'id',
    header: 'Instance ID',
    cell: (i: Instance) => (
      <Box fontWeight="bold" variant="code">
        {i.InstanceId}
      </Box>
    ),
  },
  { id: 'name', header: 'Name', cell: (i: Instance) => instanceName(i) },
  { id: 'type', header: 'Type', cell: (i: Instance) => i.InstanceType },
  {
    id: 'state',
    header: 'State',
    cell: (i: Instance) => <StateIndicator state={i.State.Name} />,
  },
  {
    id: 'ip',
    header: 'Private IP',
    cell: (i: Instance) => <Box variant="code">{i.PrivateIpAddress}</Box>,
  },
  {
    id: 'vpc',
    header: 'VPC',
    cell: (i: Instance) => <Box variant="code">{i.VpcId}</Box>,
  },
];
