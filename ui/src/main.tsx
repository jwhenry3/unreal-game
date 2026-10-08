import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installInputFocusReporting } from './inputFocus';
import './hud.css';

installInputFocusReporting();
createRoot(document.getElementById('root')!).render(<App />);
