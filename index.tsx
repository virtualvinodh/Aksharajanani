import React from 'react';
import ReactDOM from 'react-dom/client';
import AppContainer from './components/AppContainer';
import AppProviders from './components/AppProviders';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProviders>
      <AppContainer />
    </AppProviders>
  </React.StrictMode>
);
