import { createHashRouter as createBrowserRouter, redirect } from 'react-router-dom';
import App from './App.js';

export const router = createBrowserRouter([
	{
		path: '/',
		element: <App />,
		children: [
			{ index: true, loader: () => redirect('/playbook') },
			{ path: 'playbook', lazy: () => import('./pages/PlaybookPage.js') },
			{ path: 'basic', lazy: () => import('./pages/BasicPage.js') },
			{ path: 'paginator', lazy: () => import('./pages/PaginatorPage.js') },
			{ path: 'crawl-then-render', lazy: () => import('./pages/CrawlThenRenderPage.js') },
			{ path: 'render-while-crawling', lazy: () => import('./pages/RenderWhileCrawlingPage.js') },
			{ path: 'on-demand', lazy: () => import('./pages/OnDemandPage.js') },
			{ path: 'client-search', lazy: () => import('./pages/ClientSearchPage.js') },
			{ path: 'composition', lazy: () => import('./pages/CompositionPage.js') },
			{ path: 'invalidate', lazy: () => import('./pages/InvalidationPage.js') },
		],
	},
]);
