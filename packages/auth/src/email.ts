/**
 * AWS SES email sending — mirrors packages/queue/src/providers/sqs.ts's LocalStack
 * pattern: an AWS_ENDPOINT_URL override routes to LocalStack in dev (email is captured,
 * not delivered), and is unset in production for real AWS SES. Swap env vars only.
 */
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const client = new SESv2Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
  ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
});

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL ?? "no-reply@sellpilot.ai";

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
