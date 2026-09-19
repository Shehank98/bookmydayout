/**
 * Notification stub.
 *
 * The spec calls for emailing vendors on listing approval/rejection. Wiring a
 * real provider (SendGrid, Resend, Mailgun, or Firebase's email extension) is a
 * later task; for now we log the intent so the flow is in place and easy to
 * swap out. Never let a failed notification break the API request.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  try {
    // TODO: integrate a real email provider here.
    // eslint-disable-next-line no-console
    console.log(`[email] to=${msg.to} subject="${msg.subject}"`);
  } catch {
    // ignore
  }
}
