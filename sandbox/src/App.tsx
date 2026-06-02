import { useState, useEffect } from 'react';
import {
  useNavigate,
  useMatches,
  useNavigation,
  Outlet,
} from 'react-router-dom';
import {
  AppLayout,
  Box,
  ContentLayout,
  Flashbar,
  Header,
  SideNavigation,
  SideNavigationProps,
  Spinner,
  TopNavigation,
} from '@cloudscape-design/components';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production';
import { CodeBlock } from './shared.js';
import { useNotifications } from './notifications.js';

const NAV_ITEMS = [
  { type: 'link', text: 'README', href: '/readme' },
  { type: 'link', text: 'Playbook', href: '/playbook' },
  {
    type: 'section',
    text: 'Examples',
    defaultExpanded: true,
    items: [
      { type: 'link', text: 'Basic', href: '/basic' },
      { type: 'link', text: 'Async iterator', href: '/paginator' },
      { type: 'link', text: 'Crawl-then-render', href: '/crawl-then-render' },
      {
        type: 'link',
        text: 'Render-while-crawling',
        href: '/render-while-crawling',
      },
      { type: 'link', text: 'On demand', href: '/on-demand' },
      { type: 'link', text: 'Client-side search', href: '/client-search' },
      { type: 'link', text: 'Composition', href: '/composition' },
      { type: 'link', text: 'Invalidation', href: '/invalidate' },
    ],
  },
] as const satisfies SideNavigationProps.Item[];

export default function App() {
  const navigate = useNavigate();
  const matches = useMatches();
  const leaf = matches[matches.length - 1];
  const handle = leaf?.handle as
    | { label?: string; source?: string }
    | undefined;
  const label = handle?.label ?? '';
  const source = handle?.source;
  const activeHref = leaf?.pathname ?? '/readme';

  const navigation = useNavigation();
  const isNavigating = navigation.state === 'loading';

  const [showSource, setShowSource] = useState(false);
  const { notifications } = useNotifications();

  useEffect(() => {
    setShowSource(false);
  }, [activeHref]);

  const showDevtools = source && label !== 'Playbook' && label !== 'README';

  return (
    <>
      <div id="top-nav" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{
            href: '/readme',
            title: '@robohall/react-query-factory',
            onFollow: e => {
              e.preventDefault();
              navigate('/readme');
            },
          }}
          utilities={[
            {
              type: 'button',
              text: 'GitHub',
              href: 'https://github.com/roberth26/react-query-factory',
              external: true,
              externalIconAriaLabel: '(opens in new tab)',
            },
            ...(source
              ? [
                  {
                    type: 'button' as const,
                    text: showSource ? 'Close source' : 'View source',
                    onClick: () => setShowSource(s => !s),
                  },
                ]
              : []),
          ]}
          i18nStrings={{
            overflowMenuTriggerText: 'More',
            overflowMenuTitleText: 'All',
          }}
        />
      </div>
      <AppLayout
        headerSelector="#top-nav"
        toolsHide
        notifications={<Flashbar items={notifications} />}
        navigation={
          <SideNavigation
            activeHref={activeHref}
            onFollow={e => {
              e.preventDefault();
              navigate(e.detail.href);
            }}
            items={NAV_ITEMS}
          />
        }
        content={
          <ContentLayout
            header={
              <Header
                variant="h1"
                description={
                  showDevtools
                    ? '95 mock EC2 instances · all AWS calls simulated'
                    : undefined
                }
              >
                {label}
              </Header>
            }
          >
            {isNavigating ? (
              <Box padding={{ top: 'xxxl' }} textAlign="center">
                <Spinner size="large" />
              </Box>
            ) : showSource && source ? (
              <CodeBlock code={source} />
            ) : (
              <Outlet />
            )}
          </ContentLayout>
        }
      />
      {showDevtools && <ReactQueryDevtools buttonPosition="bottom-right" />}
    </>
  );
}
