import { z } from "zod";

/**
 * Shape-only validation, shared between the web signup form and mirrored by the NestJS
 * CreateCompanyDto. Never contains business rules — see docs/architecture/02-monorepo-structure.md
 * §2.3 for why packages/validation is safe to share with the frontend while
 * packages/calculations is not.
 */
/** An IANA zone the runtime knows ("Europe/Istanbul"), not free text: every date is computed in it. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().min(1).refine(isTimeZone, "Geçerli bir saat dilimi seçin.");

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  legalName: z.string().trim().min(2).max(200).optional(),
  countryCode: z.string().length(2),
  timezone: timeZoneSchema,
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
