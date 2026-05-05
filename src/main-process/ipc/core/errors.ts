export type AppErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly causeValue?: unknown;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.causeValue = options?.cause;
  }

  static badRequest(message: string, options?: { cause?: unknown }): AppError {
    return new AppError("BAD_REQUEST", message, options);
  }

  static forbidden(message: string, options?: { cause?: unknown }): AppError {
    return new AppError("FORBIDDEN", message, options);
  }

  static notFound(message: string, options?: { cause?: unknown }): AppError {
    return new AppError("NOT_FOUND", message, options);
  }

  static internal(message: string, options?: { cause?: unknown }): AppError {
    return new AppError("INTERNAL", message, options);
  }
}

export function normalizeIpcError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return AppError.internal(error.message, { cause: error });
  }

  return AppError.internal(String(error), { cause: error });
}
