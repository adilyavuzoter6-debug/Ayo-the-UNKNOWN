import { z } from "zod";
import { ROLES } from "@aquai/types";

export const inviteUserSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(ROLES as unknown as [string, ...string[]]).refine((r) => r !== "PLATFORM_ADMIN", {
    message: "PLATFORM_ADMIN cannot be assigned via company invite.",
  }),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
