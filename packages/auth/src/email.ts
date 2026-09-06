/**
 * AWS SES email sending. Real SES in every environment — there is no local capture
 * mode, so anything sent from a dev machine is really delivered. The from-address
 * (AWS_SES_FROM_EMAIL) must be a verified SES identity in AWS_REGION or every send
 * fails, and a brand-new SES account is sandboxed to verified recipients only.
 */
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { env } from "@acme/env";

const client = new SESv2Client({
  region: env.AWS_REGION,
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

/**
 * Cost accounting, injected rather than imported.
 *
 * SES charges per email and @acme/api owns the cost ledger — but @acme/api already depends
 * on @acme/auth (trpc.ts, roles.ts, business.ts), so importing it back would be a cycle.
 * Injection is the same escape hatch setImageCompressor uses for sharp, and it keeps this
 * module dependency-free.
 *
 * Unregistered means emails send and simply are not costed. Never the reverse: a password
 * reset must not fail because accounting was not wired up.
 */
export type EmailCostRecorder = (params: {
  businessId?: string | null;
  count: number;
}) => void;

let emailCostRecorder: EmailCostRecorder | null = null;

export function setEmailCostRecorder(fn: EmailCostRecorder): void {
  emailCostRecorder = fn;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Which store to bill this to. Absent for account-level mail (verification, password
   * reset) that belongs to the platform rather than any one store. */
  businessId?: string | null;
}): Promise<void> {
  const fromEmail = env.AWS_SES_FROM_EMAIL;

  try {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: fromEmail,
        Destination: { ToAddresses: [params.to] },
        Content: {
          Simple: {
            Subject: { Data: params.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: params.html, Charset: "UTF-8" },
              Text: { Data: params.text, Charset: "UTF-8" },
            },
          },
        },
      }),
    );

    // Only a delivered email costs money — a failed send falls through to the catch and is
    // deliberately not counted.
    emailCostRecorder?.({ businessId: params.businessId, count: 1 });
  } catch (err) {
    console.error("[SES] Failed to send email:", err);
    console.info(`[SES] (fallback log) To: ${params.to} | Subject: ${params.subject}\n${params.text}`);
  }
}
