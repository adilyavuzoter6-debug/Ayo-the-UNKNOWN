import { HttpException } from "@nestjs/common";
import type { TenantContext } from "../../common/types/request-context";
import { AssistantService } from "./assistant.service";

const tenant = (isDemo: boolean): TenantContext => ({
  companyId: isDemo ? "demo" : "real",
  membershipId: "m1",
  role: "COMPANY_OWNER",
  farmScopeIds: [],
  planTier: "ENTERPRISE",
  isDemo,
});

function makeService() {
  const tenantPrisma = {
    forTenant: () => ({
      companyMembership: {
        findFirst: async () => ({ company: { name: "Örnek A.Ş.", timezone: "Europe/Istanbul" } }),
      },
    }),
  };
  const tools = { forTenant: () => [] };
  const answers: unknown[] = [];
  const model = {
    answer: async (input: unknown) => {
      answers.push(input);
      return "yanıt";
    },
  };
  const service = new AssistantService(tenantPrisma as never, tools as never, model as never);
  return { service, answers };
}

const question = [{ role: "user" as const, content: "Merhaba" }];

describe("AssistantService", () => {
  it("passes the instructions and the company's context to the model and counts down the day's questions", async () => {
    const { service, answers } = makeService();
    const first = await service.chat(tenant(false), question);
    expect(first).toEqual({ reply: "yanıt", remainingToday: 99 });
    const { system } = answers[0] as { system: string[] };
    expect(system[0]).toContain("Piscatio");
    expect(system[1]).toContain("Örnek A.Ş.");
    expect((await service.chat(tenant(false), question)).remainingToday).toBe(98);
  });

  it("stops a demo after 15 questions a day", async () => {
    const { service } = makeService();
    for (let i = 0; i < 15; i++) await service.chat(tenant(true), question);
    await expect(service.chat(tenant(true), question)).rejects.toBeInstanceOf(HttpException);
    // Other companies keep their own count.
    await expect(service.chat(tenant(false), question)).resolves.toMatchObject({ remainingToday: 99 });
  });

  it("needs the conversation to end with the user's question", async () => {
    const { service } = makeService();
    await expect(
      service.chat(tenant(false), [...question, { role: "assistant", content: "Merhaba!" }]),
    ).rejects.toThrow("Son mesaj");
  });
});
