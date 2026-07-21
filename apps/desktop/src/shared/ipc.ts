import { z } from 'zod';

export const IPC_CHANNELS = {
  foundationStatus: 'foundation:get-status',
} as const;

export const foundationStatusRequestSchema = z
  .object({
    contractVersion: z.literal(1),
  })
  .strict();

export type FoundationStatusRequest = z.infer<typeof foundationStatusRequestSchema>;

export interface FoundationStatus {
  readonly repositoryFoundation: 'ready';
}

export interface IpcError {
  readonly code: 'INVALID_REQUEST' | 'INTERNAL_ERROR';
  readonly message: string;
}

export type IpcResponse<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: IpcError };

export type FoundationStatusResponse = IpcResponse<FoundationStatus>;

export interface FoundationBridge {
  getFoundationStatus(): Promise<FoundationStatusResponse>;
}

export function parseFoundationStatusRequest(
  value: unknown,
): { readonly ok: true; readonly value: FoundationStatusRequest } | { readonly ok: false } {
  const result = foundationStatusRequestSchema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
