import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { TenantPrismaService } from "../../prisma/tenant-prisma.service";
import { IDEMPOTENT_KEY } from "../decorators/idempotent.decorator";
import type { AuthenticatedUser, TenantContext } from "../types/request-context";

const MAX_KEY_LENGTH = 200;

/**
 * An in-flight record older than this is treated as abandoned (the process died between running
 * the handler and recording its outcome) and the request is allowed to run again, so a retrying
 * offline queue can't get stuck behind it forever.
 */
const STALE_IN_FLIGHT_MS = 5 * 60 * 1000;

type IdempotentRequest = Request & { tenant?: TenantContext; authUser?: AuthenticatedUser };

/**
 * Makes @Idempotent() routes safe to retry (docs/architecture/11-api-architecture.md §11.7).
 * The first request with a given `Idempotency-Key` claims the key by inserting a row (the
 * unique (companyId, key) index serializes concurrent duplicates), runs the handler, and stores
 * the response. A repeat of that key returns the stored response without running the handler
 * again — so the offline queue replaying a feeding whose first attempt actually reached the
 * server never books the feed twice. A failed request releases its key so it can be retried.
 *
 * Registered after ResponseEnvelopeInterceptor, so it stores and replays the bare handler result
 * and the envelope wraps both the same way.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const idempotent = this.reflector.get<boolean>(IDEMPOTENT_KEY, context.getHandler());
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const key = request.header("idempotency-key");
    if (!idempotent || !key || !request.tenant || !request.authUser) {
      return next.handle();
    }
    if (key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException("Idempotency-Key çok uzun.");
    }

    const response = http.getResponse<Response>();
    const userId = request.authUser.id;
    const method = request.method;
    const path = request.originalUrl.split("?")[0]!;
    const db = this.tenantPrisma.forTenant(request.tenant.companyId);

    const claim = () =>
      db.idempotencyRecord.create({
        data: { companyId: request.tenant!.companyId, userId, key, method, path },
      });

    let recordId: string;
    try {
      recordId = (await claim()).id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
      const existing = await db.idempotencyRecord.findFirst({ where: { key } });
      if (!existing) {
        throw new ConflictException("Aynı istek şu an işleniyor; birazdan tekrar deneyin.");
      }
      if (existing.userId !== userId || existing.method !== method || existing.path !== path) {
        throw new UnprocessableEntityException("Bu Idempotency-Key başka bir istek için kullanılmış.");
      }
      if (existing.completedAt) {
        response.status(existing.statusCode ?? 201);
        return of(existing.responseBody);
      }
      if (Date.now() - existing.createdAt.getTime() < STALE_IN_FLIGHT_MS) {
        throw new ConflictException("Aynı istek şu an işleniyor; birazdan tekrar deneyin.");
      }
      await db.idempotencyRecord.deleteMany({ where: { id: existing.id } });
      recordId = (await claim()).id;
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        // Stored the way Express would serialize it (Decimal → string, Date → ISO), so a replay
        // returns exactly what the original response put on the wire.
        const serialized =
          body == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue);
        // The record is already written at this point, so failing to remember the outcome must
        // not turn a success into an error the client would retry — log it and answer normally.
        await db.idempotencyRecord
          .updateMany({
            where: { id: recordId },
            data: { statusCode: response.statusCode, responseBody: serialized, completedAt: new Date() },
          })
          .catch((error: unknown) => this.logger.error(`Could not store idempotent response: ${String(error)}`));
        return body;
      }),
      catchError((error: unknown) =>
        from(db.idempotencyRecord.deleteMany({ where: { id: recordId } }).catch(() => undefined)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
