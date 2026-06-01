import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production';
import { RouterProvider } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { queryClient } from './queryClient.js';
import { router } from './router.js';
import { NotificationProvider } from './notifications.js';

applyMode(Mode.Dark);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <RouterProvider router={router} />
      </NotificationProvider>
      <div style={{ position: 'fixed', bottom: 0, zIndex: 9999 }}>
        <ReactQueryDevtools initialIsOpen={false} theme="dark" />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
