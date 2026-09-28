import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './data/queryClient';
import { startDataRuntime } from './data/bootstrap';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

void startDataRuntime();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
