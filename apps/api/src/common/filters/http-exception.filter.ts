import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { ApiErrorCode } from "@aquai/types";

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
};

/**
 * Converts every thrown exception into the standard error envelope
 * (docs/architecture/11-api-architecture.md §11.3), and logs with a requestId that's also
 * returned to the client so a support ticket can be correlated back to server logs.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? randomUUID();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = STATUS_TO_CODE[status] ?? ApiErrorCode.INTERNAL_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : undefined;
    const message = this.extractMessage(exceptionResponse, exception);
    const details = this.extractDetails(exceptionResponse);

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${message}`, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(status).json({
      error: { code, message, details, requestId },
    });
  }

  private extractMessage(exceptionResponse: unknown, exception: unknown): string {
    if (typeof exceptionResponse === "string") return exceptionResponse;
    if (
      exceptionResponse &&
      typeof exceptionResponse === "object" &&
      "message" in exceptionResponse
    ) {
      const msg = (exceptionResponse as { message: unknown }).message;
      return Array.isArray(msg) ? msg.join("; ") : String(msg);
    }
    return exception instanceof Error ? exception.message : "Internal server error.";
  }

  private extractDetails(
    exceptionResponse: unknown,
  ): Array<{ field: string; issue: string }> | undefined {
    if (
      exceptionResponse &&
      typeof exceptionResponse === "object" &&
      "message" in exceptionResponse &&
      Array.isArray((exceptionResponse as { message: unknown }).message)
    ) {
      return ((exceptionResponse as { message: string[] }).message).map((issue) => ({
        field: "",
        issue,
      }));
    }
    return undefined;
  }
}
