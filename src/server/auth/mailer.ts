import { logger } from "../logger";
import { env, publicEnv } from "../env";

/**
 * A deliberately small mail interface. Console transport in dev and CI so a
 * developer can copy a verification link out of the terminal; SMTP in
 * production. No transactional-email SDK — that is a dependency and a bill,
 * and this app sends four kinds of message.
 */

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    logger.info({ to: mail.to, subject: mail.subject }, "mail (console)");
    // Deliberately a bare console write: the whole point is that a developer
    // can see and click the link, and pino's JSON would mangle it.
    console.warn(
      `\n──────── mail ────────\nTo:      ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n──────────────────────\n`,
    );
  }
}

class SmtpMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    // PHASE-09 wires a real SMTP client. Until then, failing loudly beats
    // pretending a message was delivered.
    throw new Error(
      `SMTP transport is not implemented yet (would send "${mail.subject}" to ${mail.to})`,
    );
  }
}

let cached: Mailer | null = null;

export function mailer(): Mailer {
  if (cached) return cached;
  cached =
    env().MAIL_TRANSPORT === "smtp" ? new SmtpMailer() : new ConsoleMailer();
  return cached;
}

export function __setMailerForTests(instance: Mailer | null): void {
  cached = instance;
}

// --- Message templates ------------------------------------------------------

export function verificationMail(to: string, token: string): Mail {
  const url = `${publicEnv.appUrl}/verify?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Confirm your email — Quaderno",
    text: `Welcome to Quaderno.\n\nConfirm your address to finish setting up your account:\n\n${url}\n\nThe link is good for 24 hours. If you did not sign up, ignore this message.`,
  };
}

export function resetMail(to: string, token: string): Mail {
  const url = `${publicEnv.appUrl}/reset?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Reset your password — Quaderno",
    text: `Someone asked to reset the password for this address.\n\n${url}\n\nThe link is good for one hour and can be used once. If it was not you, nothing has changed and you can ignore this.`,
  };
}
