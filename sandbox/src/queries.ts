import { queryFactory } from 'react-query-factory';
import {
  DescribeAvailabilityZonesCommand,
  DescribeInstancesCommand,
  DescribeInstanceTypesCommand,
  EC2Client,
  paginateDescribeInstances,
} from './aws-sdk-mock.js';
import type {
  DescribeInstancesRequest,
  DescribeInstancesResult,
  DescribeInstanceTypesRequest,
  Instance,
  InstanceTypeInfo,
} from './aws-sdk-mock.js';

const ec2 = new EC2Client({ region: 'us-east-1' });

export const describeAvailabilityZones = queryFactory({
  queryKey: ['ec2:DescribeAvailabilityZones'],
  queryFn: (_: void, ctx) =>
    ec2.send(new DescribeAvailabilityZonesCommand(), {
      abortSignal: ctx.signal,
    }),
});

export const describeInstances = queryFactory({
  queryKey: ['ec2:DescribeInstances'],
  queryFn: (params: DescribeInstancesRequest, ctx) =>
    ec2.send(
      new DescribeInstancesCommand({
        ...params,
        NextToken: ctx.pageParam ?? params.NextToken,
      }),
      {
        abortSignal: ctx.signal,
      },
    ),
  getNextPageParam: r => r.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): Instance[] => [
    ...(acc ?? []),
    ...(page.Reservations?.flatMap(r => r.Instances ?? []) ?? []),
  ],
  shouldFetchNextPage: (instances, opts: { minResults?: number }) =>
    opts.minResults != null && instances.length < opts.minResults,
});

export const describeInstanceTypes = queryFactory({
  queryKey: ['ec2:DescribeInstanceTypes'],
  queryFn: (params: DescribeInstanceTypesRequest, ctx) =>
    ec2.send(
      new DescribeInstanceTypesCommand({
        ...params,
        NextToken: ctx.pageParam ?? params.NextToken,
      }),
      {
        abortSignal: ctx.signal,
      },
    ),
  getNextPageParam: r => r.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): InstanceTypeInfo[] => [
    ...(acc ?? []),
    ...(page.InstanceTypes ?? []),
  ],
  shouldFetchNextPage: (types, opts: { minResults?: number }) =>
    opts.minResults != null && types.length < opts.minResults,
});

export const describeInstancesViaPaginator = queryFactory(describeInstances, {
  queryKey: ['async-iterator'],
  queryFn: (params: DescribeInstancesRequest, ctx) =>
    paginateDescribeInstances(
      {
        client: ec2,
        pageSize: params.MaxResults,
        startingToken: ctx.pageParam ?? params.NextToken,
      },
      params,
    ),
  initialPageParam: undefined as string | undefined,
  // shouldFetchNextPage and reduce inherited from describeInstances
});

export const runningInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'running'),
});

export const stoppedInstances = queryFactory(describeInstances, {
  select: instances => instances.filter(i => i.State.Name === 'stopped'),
});

export const findInstance = queryFactory(describeInstances, {
  queryKey: ['find'],
  shouldFetchNextPage: (instances, opts: { instanceId?: string }) =>
    opts.instanceId != null &&
    !instances.some(i => i.InstanceId === opts.instanceId),
});

export { ec2 };
