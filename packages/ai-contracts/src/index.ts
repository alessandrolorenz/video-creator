export interface AiRequest {
  readonly requestId: string;
  readonly instruction: string;
  readonly inputText: string;
}

export interface AiUsage {
  readonly inputUnits: number;
  readonly outputUnits: number;
}

export interface AiResult {
  readonly requestId: string;
  readonly outputText: string;
  readonly usage?: AiUsage;
}

export interface AiProvider {
  execute(request: AiRequest): Promise<AiResult>;
}
