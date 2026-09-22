import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { loadEnv } from "@/lib/config/env";

export type InquiryNotification = {
  id: string;
  name: string;
  email: string;
  message: string;
  opportunityType: string;
};

export type NotificationResult = { delivered: true };

type EmailSender = (command: SendEmailCommand) => Promise<unknown>;

export async function sendInquiryNotification(inquiry: InquiryNotification): Promise<NotificationResult> {
  const env = loadEnv();
  const send: EmailSender = (command) => new SESv2Client({}).send(command);
  await send(new SendEmailCommand({
    FromEmailAddress: env.sesFromEmail,
    Destination: { ToAddresses: [env.sesToEmail] },
    Content: {
      Simple: {
        Subject: { Data: `New contact inquiry: ${inquiry.opportunityType}` },
        Body: { Text: { Data: `From: ${inquiry.name} <${inquiry.email}>\n\n${inquiry.message}\n\nInquiry ID: ${inquiry.id}` } },
      },
    },
  }));
  return { delivered: true };
}
