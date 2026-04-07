
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UserProvider } from './src/context/UserContext';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <UserProvider>
        <App />
      </UserProvider>
    </React.StrictMode>
  );
}
