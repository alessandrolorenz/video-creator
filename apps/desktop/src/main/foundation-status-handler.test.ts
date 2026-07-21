import { describe, expect, it, vi } from 'vitest';

import { handleFoundationStatusRequest } from './foundation-status-handler.js';

describe('foundation status IPC handler', () => {
  it.each([undefined, null, {}, { contractVersion: 2 }, { contractVersion: 1, extra: true }])(
    'rejects invalid input before invoking work: %j',
    async (payload) => {
      const readStatus = vi.fn(() => ({ repositoryFoundation: 'ready' as const }));

      const response = await handleFoundationStatusRequest(payload, readStatus);

      expect(response).toEqual({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid foundation status request.' },
      });
      expect(readStatus).not.toHaveBeenCalled();
    },
  );

  it('returns the typed status for a valid request', async () => {
    const readStatus = vi.fn(() => ({ repositoryFoundation: 'ready' as const }));

    await expect(
      handleFoundationStatusRequest({ contractVersion: 1 }, readStatus),
    ).resolves.toEqual({ ok: true, value: { repositoryFoundation: 'ready' } });
    expect(readStatus).toHaveBeenCalledOnce();
  });

  it('returns a stable error envelope without leaking internal details', async () => {
    const readStatus = vi.fn(() => {
      throw new Error('secret internal detail');
    });

    const response = await handleFoundationStatusRequest({ contractVersion: 1 }, readStatus);

    expect(response).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Foundation status is unavailable.' },
    });
    expect(JSON.stringify(response)).not.toContain('secret internal detail');
  });
});
