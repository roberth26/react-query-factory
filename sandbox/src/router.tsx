import { createHashRouter as createBrowserRouter, redirect } from 'react-router-dom';
import App from './App.js';

export const router = createBrowserRouter([
	{
		path: '/',
		element: <App />,
		children: [
			{ index: true, loader: () => redirect('/playbook') },
			{ path: 'playbook', lazy: () => import('./pages/GuidePage.js') },
			{ path: 'basic', lazy: () => import('./pages/BasicPage.js') },
			{ path: 'crawl', lazy: () => import('./pages/ExhaustiveCrawlPage.js') },
			{ path: 'dropdown', lazy: () => import('./pages/DropdownPage.js') },
			{ path: 'infinite', lazy: () => import('./pages/InfinitePage.js') },
			{ path: 'bounded-crawl', lazy: () => import('./pages/BoundedCrawlPage.js') },
			{ path: 'invalidate', lazy: () => import('./pages/InvalidationPage.js') },
			{ path: 'composition', lazy: () => import('./pages/CompositionPage.js') },
		],
	},
]);
