import { registerSW } from 'virtual:pwa-register';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppProvider } from './context/AppContext';

if (typeof screen !== 'undefined' && screen.orientation && (screen.orientation as any).lock) {
  (screen.orientation as any).lock('portrait').catch(() => {
    // Ignore errors for devices/browsers that don't support locking
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);




if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
