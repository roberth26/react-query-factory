import {
  createHashRouter as createBrowserRouter,
  redirect,
} from 'react-router-dom';
import App from './App.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, loader: () => redirect('/readme') },
      { path: 'readme', lazy: () => import('./pages/ReadmePage.js') },
      { path: 'playbook', lazy: () => import('./pages/PlaybookPage.js') },
      { path: 'walkthrough', lazy: () => import('./pages/WalkthroughPage.js') },
      { path: 'basic', lazy: () => import('./pages/BasicPage.js') },
      {
        path: 'async-iterator',
        lazy: () => import('./pages/AsyncIteratorPage.js'),
      },
      {
        path: 'crawl-then-render',
        lazy: () => import('./pages/CrawlThenRenderPage.js'),
      },
      {
        path: 'render-while-crawling',
        lazy: () => import('./pages/RenderWhileCrawlingPage.js'),
      },
      { path: 'on-demand', lazy: () => import('./pages/OnDemandPage.js') },
      {
        path: 'client-search',
        lazy: () => import('./pages/ClientSearchPage.js'),
      },
      { path: 'composition', lazy: () => import('./pages/CompositionPage.js') },
      { path: 'injection', lazy: () => import('./pages/InjectionPage.js') },
      { path: 'invalidate', lazy: () => import('./pages/InvalidationPage.js') },
    ],
  },
]);
