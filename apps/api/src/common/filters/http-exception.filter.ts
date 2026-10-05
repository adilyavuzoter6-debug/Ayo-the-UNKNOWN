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
import { Prisma } from "@prisma/client";
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
 * Prisma's P2002 ("Unique constraint failed") carries the violated column list in
 * `meta.target`, e.g. `["companyId", "farmSectionId", "code"]`. Without this map, that error
 * reached the client as the raw driver message — "Invalid `prisma.tank.create()` invocation:
 * Unique constraint failed on the fields: (...)" — which is both unreadable in Turkish and a
 * 500, when it's really a 409 the user caused by reusing a code. Keyed by the target fields
 * sorted + joined, matching every @@unique in schema.prisma as of this writing; an unmapped
 * combination still gets a Turkish 409 via the fallback below, just a generic one.
 */
const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  "code,companyId": "Bu kod bu şirkette zaten kullanılıyor.",
  "code,companyId,farmSectionId": "Bu kod bu bölümde zaten kullanılıyor — başka bir kod deneyin.",
  "companyId,lotCode": "Bu lot kodu zaten kullanılıyor.",
  "companyId,userId": "Bu kullanıcı zaten şirketin bir üyesi.",
  "farmId,membershipId": "Bu çiftlik zaten bu üyeye atanmış.",
  "batchId,snapshotDate,tankId": "Bu tarih için zaten bir biyokütle anlık görüntüsü var.",
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

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === "P2002") {
      const target = exception.meta?.target;
      const key = Array.isArray(target) ? [...target].sort().join(",") : String(target ?? "");
      const message = UNIQUE_CONSTRAINT_MESSAGES[key] ?? "Bu kayıt zaten mevcut.";
      this.logger.warn(`[${requestId}] P2002 on (${key}) — ${message}`);
      response.status(HttpStatus.CONFLICT).json({
        error: { code: ApiErrorCode.CONFLICT, message, details: undefined, requestId },
      });
      return;
    }

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
