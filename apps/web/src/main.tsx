import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { SessionProvider } from './app/session';
import './styles.css';

// Updates apply on the next visit rather than reloading under the owner's hands.
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('no #root to mount into');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
