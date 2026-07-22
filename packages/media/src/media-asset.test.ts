import { describe, expectTypeOf, it } from 'vitest';

import type { AssetId, JobId, TimeUs } from '@ai-video-assembly/domain';

import type {
  MediaAssetSummaryV1,
  MediaProbeJobV1,
  MediaProbeResultV1,
  MediaSourceRefV1,
  RationalV1,
} from './media-asset.js';

describe('media asset contracts', () => {
  it('keeps privileged source data separate from renderer-safe summaries', () => {
    expectTypeOf<MediaSourceRefV1>().toEqualTypeOf<{
      readonly assetId: AssetId;
      readonly absolutePath: string;
    }>();
    expectTypeOf<MediaAssetSummaryV1['durationUs']>().toEqualTypeOf<TimeUs>();
    expectTypeOf<MediaAssetSummaryV1>().not.toHaveProperty('absolutePath');
  });

  it('defines a versioned media-specific probe job and closed result', () => {
    expectTypeOf<MediaProbeJobV1>().toMatchTypeOf<{
      readonly contractVersion: 1;
      readonly jobId: JobId;
      readonly source: MediaSourceRefV1;
    }>();
    expectTypeOf<MediaProbeResultV1>().toHaveProperty('status');
  });

  it('uses integer rationals only', () => {
    expectTypeOf<RationalV1>().toEqualTypeOf<{
      readonly numerator: number;
      readonly denominator: number;
    }>();
  });
});
