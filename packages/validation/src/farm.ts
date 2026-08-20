import { z } from "zod";

export const createFarmSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, "code must be alphanumeric (dashes/underscores allowed)"),
  timezone: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export type CreateFarmInput = z.infer<typeof createFarmSchema>;

export const updateFarmSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, "code must be alphanumeric (dashes/underscores allowed)")
    .optional(),
  timezone: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateFarmInput = z.infer<typeof updateFarmSchema>;
