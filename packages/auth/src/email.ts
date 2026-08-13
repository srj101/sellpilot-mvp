/**
 * AWS SES email sending — mirrors packages/queue/src/providers/sqs.ts's LocalStack
 * pattern: an AWS_ENDPOINT_URL override routes to LocalStack in dev (email is captured,
 * not delivered), and is unset in production for real AWS SES. Swap env vars only.
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
  ...(env.AWS_ENDPOINT_URL ? { endpoint: env.AWS_ENDPOINT_URL } : {}),
});

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
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
  } catch (err) {
    console.error("[SES] Failed to send email:", err);
    console.info(`[SES] (fallback log) To: ${params.to} | Subject: ${params.subject}\n${params.text}`);
  }
}
