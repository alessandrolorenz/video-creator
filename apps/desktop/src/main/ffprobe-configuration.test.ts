import { describe, expect, it } from 'vitest';

import { resolveFfprobeConfigurationV1 } from './ffprobe-configuration.js';

describe('main-owned ffprobe configuration', () => {
  it('uses the exact bare executable when the override is absent', () => {
    expect(resolveFfprobeConfigurationV1({})).toEqual({
      ok: true,
      value: { executable: 'ffprobe' },
    });
  });

  it('passes a valid absolute override unchanged', () => {
    const executable = '/Applications/FFmpeg Tools/ffprobe';
    expect(resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: executable })).toEqual({
      ok: true,
      value: { executable },
    });
  });

  it.each(['', ' ffprobe ', './ffprobe', '~/bin/ffprobe', '$HOME/bin/ffprobe', 'bad\0path'])(
    'rejects invalid override %j without normalization',
    (value) => {
      expect(resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: value })).toEqual({
        ok: false,
        error: {
          code: 'FFPROBE_CONFIGURATION_INVALID',
          message: 'The ffprobe configuration is invalid.',
        },
      });
    },
  );

  it('accepts 4096 code units and rejects 4097 before utility creation', () => {
    const exact = `/${'x'.repeat(4_095)}`;
    expect(exact).toHaveLength(4_096);
    expect(resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: exact }).ok).toBe(true);
    expect(resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: `${exact}x` }).ok).toBe(
      false,
    );
  });

  it('returns frozen path-redacted results', () => {
    const result = resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: 'relative' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('relative');
  });
});
