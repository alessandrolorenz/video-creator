import { isAbsolute } from 'node:path';

export interface FfprobeConfigurationV1 {
  readonly executable: string;
}

export type FfprobeConfigurationResultV1 =
  | { readonly ok: true; readonly value: FfprobeConfigurationV1 }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'FFPROBE_CONFIGURATION_INVALID';
        readonly message: string;
      };
    };

export interface MainEnvironmentV1 {
  readonly AI_VIDEO_ASSEMBLY_FFPROBE_PATH?: string | undefined;
}

function invalidConfiguration(): FfprobeConfigurationResultV1 {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: 'FFPROBE_CONFIGURATION_INVALID',
      message: 'The ffprobe configuration is invalid.',
    }),
  });
}

export function resolveFfprobeConfigurationV1(
  environment: MainEnvironmentV1,
): FfprobeConfigurationResultV1 {
  const override = environment.AI_VIDEO_ASSEMBLY_FFPROBE_PATH;
  if (override === undefined) {
    return Object.freeze({
      ok: true,
      value: Object.freeze({ executable: 'ffprobe' }),
    });
  }
  if (
    override.length < 1 ||
    override.length > 4_096 ||
    override.includes('\0') ||
    !isAbsolute(override)
  ) {
    return invalidConfiguration();
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ executable: override }),
  });
}

export function resolveFfprobeConfigurationFromMainEnvironment(): FfprobeConfigurationResultV1 {
  return resolveFfprobeConfigurationV1({
    AI_VIDEO_ASSEMBLY_FFPROBE_PATH: process.env.AI_VIDEO_ASSEMBLY_FFPROBE_PATH,
  });
}
