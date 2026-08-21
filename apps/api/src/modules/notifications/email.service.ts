import { Injectable, Logger } from "@nestjs/common";

/**
 * Thin wrapper around Resend's REST API (no SDK dependency — a single POST endpoint doesn't
 * warrant one). Silently no-ops when RESEND_API_KEY isn't configured (local dev / test envs)
 * rather than throwing, since email delivery is a best-effort side effect that must never take
 * down the write path (alert creation, etc.) it's attached to.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly fromEmail = process.env.RESEND_FROM_EMAIL ?? "uyarilar@piscatiotechnologies.com";

  async send(to: string[], subject: string, html: string): Promise<void> {
    if (to.length === 0) return;
    if (!this.apiKey) {
      this.logger.warn(`RESEND_API_KEY not set — skipped email "${subject}" to ${to.length} recipient(s).`);
      return;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.fromEmail, to, subject, html }),
      });
      if (!res.ok) {
        this.logger.error(`Resend API returned ${res.status}: ${await res.text()}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
