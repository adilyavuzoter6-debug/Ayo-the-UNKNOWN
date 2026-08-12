import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

interface PaginatedShape<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

function isPaginatedShape<T>(value: unknown): value is PaginatedShape<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as PaginatedShape<T>).items) &&
    typeof (value as PaginatedShape<T>).total === "number"
  );
}

/**
 * Wraps every controller return value in the standard { data, meta } / { data, meta: {page,...} }
 * envelope. See docs/architecture/11-api-architecture.md §11.3.
 *
 * Controllers return plain domain objects/arrays (or the { items, page, pageSize, total } shape
 * for paginated lists) — they never build the envelope themselves, so the shape can't drift
 * endpoint by endpoint.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (isPaginatedShape(result)) {
          const { items, page, pageSize, total } = result;
          return { data: items, meta: { page, pageSize, total } };
        }
        return { data: result };
      }),
    );
  }
}
