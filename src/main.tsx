import { createRoot } from 'react-dom/client'; import React from 'react'; import App from './app/App'; import './styles/index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
