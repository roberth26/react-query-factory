import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCollection } from '@cloudscape-design/collection-hooks';
import type {
  DescribeInstancesRequest,
  InstanceTypeInfo,
} from '../aws-sdk-mock.js';
import { describeInstanceTypes, describeInstances } from '../queries.js';
import { queryClient } from '../queryClient.js';
import pageSource from './CrawlThenRenderPage.tsx?raw';
import {
  CollectionPreferences,
  Container,
  ExpandableSection,
  FormField,
  Header,
  Pagination,
  Select,
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

export const handle = { label: 'Crawl-then-render', source: pageSource };

const FACTORY_CODE = `\
// Number.MAX_SAFE_INTEGER ensures the crawl never stops early.
// The full list of instance types is ready before the Select renders.
const describeInstanceTypes = queryFactory({
  queryKey: ['ec2:DescribeInstanceTypes'],
  queryFn: (params, ctx) => ec2.send(new DescribeInstanceTypesCommand({ ...params, NextToken: ctx.pageParam ?? params.NextToken }), ...),
  getNextPageParam: r => r.NextToken,
  initialPageParam: undefined as string | undefined,
  reduce: (acc, page): InstanceTypeInfo[] => [...(acc ?? []), ...(page.InstanceTypes ?? [])],
  shouldFetchNextPage: (types, opts: { minResults?: number }) =>
    opts.minResults != null && types.length < opts.minResults,
});

// Both queries run in parallel. instanceTypes populates the Select;
// describeInstances re-crawls whenever the selected type changes.
const { data: instanceTypes } = useQuery(
  describeInstanceTypes({ MaxResults: 10 }, { minResults: Number.MAX_SAFE_INTEGER }),
);
const { data: instances } = useQuery(
  describeInstances({
    MaxResults: 20,
    Filters: selectedType ? [{ Name: 'instance-type', Values: [selectedType] }] : undefined,
  }),
);`;

export async function loader() {
  const instanceTypesOptions = describeInstanceTypes(
    { MaxResults: 10 },
    { minResults: Number.MAX_SAFE_INTEGER },
  );
  await Promise.all([
    queryClient.prefetchQuery(instanceTypesOptions),
    queryClient.prefetchQuery(describeInstances({ MaxResults: 20 })),
  ]);
  return instanceTypesOptions;
}

function CrawlThenRenderPage() {
  const instanceTypesOptions = useLoaderData<Awaited<ReturnType<typeof loader>>>();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [preferences, setPreferences] = useState({ pageSize: 20 });

  const { data: instanceTypes, isLoading: typesLoading } =
    useQuery(instanceTypesOptions);

  const filters: DescribeInstancesRequest['Filters'] =
    selectedTypes.length > 0
      ? [{ Name: 'instance-type', Values: selectedTypes }]
      : undefined;

  const { data: instances, isLoading: instancesLoading } = useQuery(
    describeInstances({ MaxResults: 20, Filters: filters }),
  );

  const { items, filterProps, paginationProps, collectionProps } =
    useCollection(instances ?? [], {
      filtering: {},
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
    });

  const typeOptions = (instanceTypes ?? []).map((t: InstanceTypeInfo) => ({
    value: t.InstanceType!,
    label: t.InstanceType!,
    description: `${t.VCpuInfo?.DefaultVCpus} vCPU · ${((t.MemoryInfo?.SizeInMiB ?? 0) / 1024).toFixed(t.MemoryInfo?.SizeInMiB! >= 1024 ? 0 : 1)} GiB${!t.CurrentGeneration ? ' · previous gen' : ''}`,
  }));

  return (
    <SpaceBetween size="m">
      <TextContent>
        <p>
          Some data must be complete before the UI is useful — a dropdown with
          half the options is worse than a spinner. This is the
          "crawl-then-render" pattern, in contrast to the{' '}
          <strong>Render-while-crawling</strong> demo which streams results
          while crawling. Here, <code>describeInstanceTypes</code> uses the same{' '}
          <code>minResults</code> option as <code>describeInstances</code>;
          passing <code>Number.MAX_SAFE_INTEGER</code> tells the factory to
          exhaust all pages unconditionally. Both queries run in parallel:
          instance types populate the Select while instances load the table.
          When the user changes the type filter, only the instance query
          re-crawls — the type list is already cached. From a UX standpoint, the
          Select is disabled until the full crawl completes, ensuring the user
          always sees every available option.
        </p>
      </TextContent>
      <ExpandableSection headerText="Factory code" variant="container">
        <CodeBlock code={FACTORY_CODE} />
      </ExpandableSection>
      <Container header={<Header variant="h2">Filter by instance type</Header>}>
        <FormField
          label="Instance type"
          description={
            typesLoading
              ? 'Crawling all instance types…'
              : `${typeOptions.length} types available (crawled across ${Math.ceil(typeOptions.length / 10)} API calls)`
          }
        >
          {typesLoading ? (
            <Spinner />
          ) : (
            <Select
              selectedOption={
                selectedTypes[0]
                  ? { value: selectedTypes[0], label: selectedTypes[0] }
                  : null
              }
              onChange={({ detail }) =>
                setSelectedTypes(
                  detail.selectedOption ? [detail.selectedOption.value!] : [],
                )
              }
              options={[{ value: '', label: 'All types' }, ...typeOptions]}
              placeholder="Select an instance type…"
              filteringType="auto"
            />
          )}
        </FormField>
      </Container>
      <Table
        stripedRows
        {...collectionProps}
        loading={instancesLoading}
        loadingText="Crawling instances…"
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
          <Header
            variant="h2"
            counter={instances ? `(${instances.length})` : undefined}
          >
            {selectedTypes[0]
              ? `${selectedTypes[0]} instances`
              : 'All instances'}
          </Header>
        }
        trackBy="InstanceId"
      />
    </SpaceBetween>
  );
}

export { CrawlThenRenderPage as Component };
