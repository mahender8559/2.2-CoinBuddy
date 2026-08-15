import { registerSW } from 'virtual:pwa-register';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './v35.css';
import './v35-form-showcase.css';
import './v35-form-reference-exact.css';
import './v35-form-markup-exact.css';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';

type LockableScreenOrientation = ScreenOrientation & { lock?: (orientation: 'portrait') => Promise<void> };
const screenOrientation = typeof screen !== 'undefined' ? screen.orientation as LockableScreenOrientation : undefined;

if (screenOrientation?.lock) {
  screenOrientation.lock('portrait').catch(() => {
    // Ignore errors for devices/browsers that don't support locking
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><AppProvider><App /></AppProvider></ErrorBoundary>
  </StrictMode>,
);




if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}
