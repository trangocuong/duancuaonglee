import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './app/page';
import './app/globals.css';
import './host.css';
createRoot(document.getElementById('evaluation-root')!).render(<Home />);

// The site page hosting this frame enlarges it to the whole window while a dialog is open,
// because the dialogs are wider than the area beside the site sidebar.
if (window.parent !== window) {
  let open = false;
  const report = () => {
    const next = Boolean(document.querySelector('.modal-backdrop'));
    if (next === open) return;
    open = next;
    window.parent.postMessage({type: 'qeval:dialog', open}, location.origin);
  };
  new MutationObserver(report).observe(document.body, {childList: true, subtree: true});
}
