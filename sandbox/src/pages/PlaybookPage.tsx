import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  ColumnLayout,
  Container,
  Header,
  SpaceBetween,
} from '@cloudscape-design/components';
import pageSource from './PlaybookPage.tsx?raw';

export const handle = { label: 'Playbook', source: pageSource };

export async function loader() {
  return null;
}

interface PatternInfo {
  name: string;
  href: string;
  tag: string;
  tagColor: 'blue' | 'grey' | 'green' | 'red';
  useWhen: string;
}

const BASIC: PatternInfo = {
  name: 'Basic',
  href: '/basic',
  tag: 'Single call',
  tagColor: 'grey',
  useWhen: 'API returns a single, non-paginated response',
};

const ASYNC_ITERATOR: PatternInfo = {
  name: 'Async iterator',
  href: '/async-iterator',
  tag: 'Async iterable',
  tagColor: 'blue',
  useWhen:
    'queryFn returns an AsyncIterable — the iterator manages its own cursor, no getNextPageParam needed. All display patterns below still apply.',
};

const CRAWL_THEN_RENDER: PatternInfo = {
  name: 'Crawl-then-render',
  href: '/crawl-then-render',
  tag: 'Blocking crawl',
  tagColor: 'red',
  useWhen: 'UI is useless with partial data — dropdown options, counts, totals',
};

const CONDITIONAL_CRAWL: PatternInfo = {
  name: 'Client-side search',
  href: '/client-search',
  tag: 'Early stop',
  tagColor: 'blue',
  useWhen:
    'Need a record subset — stop crawling when accumulated results meet a condition, for APIs without server-side search',
};

const RENDER_WHILE_CRAWLING: PatternInfo = {
  name: 'Render-while-crawling',
  href: '/render-while-crawling',
  tag: 'Streaming',
  tagColor: 'green',
  useWhen:
    'UI can render partial results — rows stream in as each page arrives',
};

const INFINITE: PatternInfo = {
  name: 'On demand',
  href: '/on-demand',
  tag: 'On demand',
  tagColor: 'blue',
  useWhen:
    'User navigates pages; each page crawls API calls until the UI page size is met',
};

const COMPOSITION: PatternInfo = {
  name: 'Composition',
  href: '/composition',
  tag: 'Cross-cutting',
  tagColor: 'grey',
  useWhen:
    'Multiple views of the same data — child factories share one cache entry',
};

const INVALIDATION: PatternInfo = {
  name: 'Invalidation',
  href: '/invalidate',
  tag: 'Cross-cutting',
  tagColor: 'grey',
  useWhen:
    'Mutation changes server state — one namespace key marks all variants stale',
};

function PatternCard({ pattern }: { pattern: PatternInfo }) {
  const navigate = useNavigate();
  return (
    <SpaceBetween size="xs">
      <Badge color={pattern.tagColor}>{pattern.tag}</Badge>
      <Box fontWeight="bold" fontSize="heading-m">
        {pattern.name}
      </Box>
      <Box color="text-body-secondary">{pattern.useWhen}</Box>
      <Button variant="inline-link" onClick={() => navigate(pattern.href)}>
        See example
      </Button>
    </SpaceBetween>
  );
}

function DecisionStep({
  question,
  exitLabel,
  exitPattern,
  continueLabel,
  continueNext,
}: {
  question: string;
  exitLabel: string;
  exitPattern: PatternInfo;
  continueLabel: string;
  continueNext: string;
}) {
  return (
    <Container header={<Header variant="h3">{question}</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <SpaceBetween size="s">
          <Box variant="awsui-key-label">If {exitLabel}</Box>
          <PatternCard pattern={exitPattern} />
        </SpaceBetween>
        <SpaceBetween size="s">
          <Box variant="awsui-key-label">If {continueLabel}</Box>
          <Box color="text-body-secondary">↓ {continueNext}</Box>
        </SpaceBetween>
      </ColumnLayout>
    </Container>
  );
}

function FinalStep({
  question,
  leftLabel,
  leftPattern,
  rightLabel,
  rightPattern,
}: {
  question: string;
  leftLabel: string;
  leftPattern: PatternInfo;
  rightLabel: string;
  rightPattern: PatternInfo;
}) {
  return (
    <Container header={<Header variant="h3">{question}</Header>}>
      <ColumnLayout columns={2} variant="text-grid">
        <SpaceBetween size="s">
          <Box variant="awsui-key-label">If {leftLabel}</Box>
          <PatternCard pattern={leftPattern} />
        </SpaceBetween>
        <SpaceBetween size="s">
          <Box variant="awsui-key-label">If {rightLabel}</Box>
          <PatternCard pattern={rightPattern} />
        </SpaceBetween>
      </ColumnLayout>
    </Container>
  );
}

function GuidePage() {
  return (
    <SpaceBetween size="l">
      <SpaceBetween size="m">
        <DecisionStep
          question="Does the API paginate?"
          exitLabel="No"
          exitPattern={BASIC}
          continueLabel="Yes"
          continueNext="How does the queryFn expose pages?"
        />

        <Container
          header={
            <Header
              variant="h3"
              description="A queryFn style, not a display pattern — combine with any crawl pattern below."
            >
              How does the queryFn expose pages?
            </Header>
          }
        >
          <ColumnLayout columns={2} variant="text-grid">
            <SpaceBetween size="s">
              <Box variant="awsui-key-label">Cursor-based (default)</Box>
              <Box color="text-body-secondary">
                queryFn returns one page; set <code>getNextPageParam</code> and{' '}
                <code>initialPageParam</code> — the library drives the loop.
              </Box>
              <Box color="text-body-secondary">
                ↓ Choose a display pattern below
              </Box>
            </SpaceBetween>
            <SpaceBetween size="s">
              <Box variant="awsui-key-label">Async iterable</Box>
              <PatternCard pattern={ASYNC_ITERATOR} />
            </SpaceBetween>
          </ColumnLayout>
        </Container>

        <DecisionStep
          question="Does the UI need complete data before it's useful?"
          exitLabel="Yes"
          exitPattern={CRAWL_THEN_RENDER}
          continueLabel="No"
          continueNext="Does the user control page navigation?"
        />
        <DecisionStep
          question="Does the user control page navigation?"
          exitLabel="Yes"
          exitPattern={INFINITE}
          continueLabel="No"
          continueNext="Can the UI render partial results while loading?"
        />
        <FinalStep
          question="Can the UI render partial results while loading?"
          leftLabel="Yes"
          leftPattern={RENDER_WHILE_CRAWLING}
          rightLabel="No"
          rightPattern={CONDITIONAL_CRAWL}
        />
      </SpaceBetween>

      <Container
        header={
          <Header
            variant="h2"
            description="These apply alongside any pattern above."
          >
            Cross-cutting concerns
          </Header>
        }
      >
        <ColumnLayout columns={2} variant="text-grid">
          <PatternCard pattern={COMPOSITION} />
          <PatternCard pattern={INVALIDATION} />
        </ColumnLayout>
      </Container>
    </SpaceBetween>
  );
}

export { GuidePage as Component };
