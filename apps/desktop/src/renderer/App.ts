import { createElement, useEffect, useState } from 'react';

type FoundationViewState = 'checking' | 'ready' | 'unavailable';

const statusMessage: Record<FoundationViewState, string> = {
  checking: 'Checking secure foundation status…',
  ready: 'Secure desktop foundation ready.',
  unavailable: 'Foundation status unavailable.',
};

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<FoundationViewState>('checking');

  useEffect(() => {
    let active = true;
    void window.aiVideoAssembly.getFoundationStatus().then((response) => {
      if (active) setStatus(response.ok ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, []);

  return createElement(
    'main',
    { className: 'foundation-shell' },
    createElement(
      'section',
      { 'aria-labelledby': 'foundation-title', className: 'foundation-card' },
      createElement('p', { className: 'eyebrow' }, 'AI Video Assembly'),
      createElement('h1', { id: 'foundation-title' }, 'Repository foundation'),
      createElement('p', { 'aria-live': 'polite', className: 'status' }, statusMessage[status]),
      createElement('p', { className: 'scope' }, 'M0.1 establishes the secure desktop boundary.'),
    ),
  );
}
