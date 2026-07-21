import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('neutral renderer shell', () => {
  it('renders only repository-foundation status content', () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain('AI Video Assembly');
    expect(markup).toContain('Repository foundation');
    expect(markup).toContain('Checking secure foundation status');
    expect(markup).not.toMatch(/file picker|transcript|timeline|render video|export|API key/i);
  });
});
