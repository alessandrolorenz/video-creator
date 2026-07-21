import { describe, expect, it, vi } from 'vitest';

import { createFoundationBridge } from './bridge.js';

describe('preload bridge', () => {
  it('is frozen and exposes exactly one namespaced capability', async () => {
    const invoke = vi.fn(async () => ({
      ok: true as const,
      value: { repositoryFoundation: 'ready' as const },
    }));
    const bridge = createFoundationBridge(invoke);

    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.keys(bridge)).toEqual(['getFoundationStatus']);
    await expect(bridge.getFoundationStatus()).resolves.toEqual({
      ok: true,
      value: { repositoryFoundation: 'ready' },
    });
    expect(invoke).toHaveBeenCalledWith('foundation:get-status', { contractVersion: 1 });
  });
});
