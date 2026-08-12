import { z } from "zod";

/**
 * Shape-only validation, shared between the web signup form and mirrored by the NestJS
 * CreateCompanyDto. Never contains business rules — see docs/architecture/02-monorepo-structure.md
 * §2.3 for why packages/validation is safe to share with the frontend while
 * packages/calculations is not.
 */
export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  legalName: z.string().trim().min(2).max(200).optional(),
  countryCode: z.string().length(2),
  timezone: z.string().min(1),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
