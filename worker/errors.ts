export interface SafeErrorDiagnostic {
  level: "error";
  event: "upstream_fetch_failed";
  category: "network" | "runtime" | "timeout";
  errorName: "AbortError" | "Error" | "TimeoutError" | "TypeError";
  causeCode?: string;
}

export class FeedError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly diagnostic?: SafeErrorDiagnostic;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    options?: { cause?: unknown; diagnostic?: SafeErrorDiagnostic },
  ) {
    super(message, { cause: options?.cause });
    this.name = "FeedError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.diagnostic = options?.diagnostic;
  }
}
