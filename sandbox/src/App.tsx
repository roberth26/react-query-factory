import { useState, useEffect } from 'react';
import { useNavigate, useMatches, useNavigation, Outlet } from 'react-router-dom';
import {
	AppLayout,
	Box,
	Button,
	ContentLayout,
	Flashbar,
	Header,
	SideNavigation,
	SideNavigationProps,
	Spinner,
} from '@cloudscape-design/components';
import { CodeBlock } from './shared.js';
import { useNotifications } from './notifications.js';

const NAV_ITEMS = [
	{ type: 'link', text: 'Playbook', href: '/playbook' },
	{ type: 'divider' },
	{ type: 'link', text: 'Basic', href: '/basic' },
	{ type: 'link', text: 'Exhaustive crawl', href: '/crawl' },
	{ type: 'link', text: 'Crawl for dropdown', href: '/dropdown' },
	{ type: 'link', text: 'Infinite', href: '/infinite' },
	{ type: 'link', text: 'Bounded crawl', href: '/bounded-crawl' },
	{ type: 'link', text: 'Invalidation', href: '/invalidate' },
	{ type: 'link', text: 'Composition', href: '/composition' },
] as const satisfies SideNavigationProps.Item[];

export default function App() {
	const navigate = useNavigate();
	const matches = useMatches();
	const leaf = matches[matches.length - 1];
	const handle = leaf?.handle as { label?: string; source?: string } | undefined;
	const label = handle?.label ?? '';
	const source = handle?.source;
	const activeHref = leaf?.pathname ?? '/basic';

	const navigation = useNavigation();
	const isNavigating = navigation.state === 'loading';

	const [showSource, setShowSource] = useState(false);
	const { notifications } = useNotifications();

	useEffect(() => {
		setShowSource(false);
	}, [activeHref]);

	return (
		<AppLayout
			toolsHide
			notifications={<Flashbar items={notifications} />}
			navigation={
				<SideNavigation
					header={{ text: '@robohall/react-query-factory', href: '/basic' }}
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
							description="95 mock EC2 instances · all AWS calls simulated"
							actions={
								source && (
									<Button onClick={() => setShowSource(s => !s)}>
										{showSource ? 'View demo' : 'View source'}
									</Button>
								)
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
	);
}
