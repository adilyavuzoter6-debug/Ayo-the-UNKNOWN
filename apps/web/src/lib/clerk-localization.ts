import { trTR } from "@clerk/localizations";

const APP_NAME = "Piscatio";

/** Replaces Clerk's {{applicationName}} placeholder in every string of a localization tree. */
function withAppName<T>(node: T): T {
  if (typeof node === "string") return node.replaceAll("{{applicationName}}", APP_NAME) as T;
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withAppName(v)])) as T;
  }
  return node;
}

/**
 * Clerk's sign-in, sign-up and account screens in Turkish. The application name is written in here
 * rather than taken from the Clerk instance, whose own name setting has shown up as "marinai".
 */
export const clerkLocalization = withAppName({
  ...trTR,
  signIn: {
    ...trTR.signIn,
    start: {
      ...trTR.signIn?.start,
      title: "{{applicationName}}'ya giriş yapın",
      subtitle: "Tekrar hoş geldiniz! Devam etmek için giriş yapın.",
    },
  },
  signUp: {
    ...trTR.signUp,
    start: {
      ...trTR.signUp?.start,
      title: "{{applicationName}} hesabı oluşturun",
      subtitle: "30 gün ücretsiz deneyin, kredi kartı gerekmez.",
    },
  },
});
