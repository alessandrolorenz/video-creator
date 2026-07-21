import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AiProvider, AiRequest, AiResult } from './index.js';

describe('provider-neutral AI contracts', () => {
  it('describes a request/result boundary without naming a vendor SDK', async () => {
    const request: AiRequest = {
      requestId: 'request-1',
      instruction: 'Summarize this transcript.',
      inputText: 'A deterministic transcript.',
    };
    const provider: AiProvider = {
      execute: async (value) => ({
        requestId: value.requestId,
        outputText: 'Summary.',
        usage: { inputUnits: 3, outputUnits: 1 },
      }),
    };

    const result = await provider.execute(request);

    expect(result.requestId).toBe(request.requestId);
    expectTypeOf(result).toEqualTypeOf<AiResult>();
  });
});
