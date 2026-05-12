import nodemailer from "nodemailer";
import { getAppBaseUrl } from "@/lib/app-url";
import { getGoogleAccessToken } from "@/lib/google-auth";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** Placeholder From; Gmail API replaces it with the authenticated user's address when sending. */
const PLACEHOLDER_FROM = "Valtira PM <noreply@valtira.net>";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build RFC 2822 MIME message with nodemailer so clients render HTML correctly. Returns raw message buffer. */
async function buildRawMessage(opts: {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  plainText?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<Buffer> {
  const htmlTrimmed = opts.html.replace(/\r\n/g, "\n").trim();
  const text = opts.plainText ?? htmlTrimmed.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  });
  const result = await transporter.sendMail({
    from: PLACEHOLDER_FROM,
    to: opts.to.join(", "),
    cc: opts.cc?.length ? opts.cc.join(", ") : undefined,
    subject: opts.subject.trim(),
    text,
    html: htmlTrimmed,
    attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  const raw = result.message;
  if (!raw || !Buffer.isBuffer(raw)) {
    throw new Error("Failed to build email message");
  }
  return raw;
}

export type SendEmailViaGmailOptions = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

/**
 * Send an email via the user's Gmail (using their connected Google account).
 * Requires the user to have connected Google in Settings with Gmail send scope.
 */
export async function sendEmailViaGmail(
  userId: string,
  opts: SendEmailViaGmailOptions
): Promise<{ error?: string }> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) {
    return { error: "Connect Google in Settings to send from your Valtira Gmail." };
  }
  if (opts.to.length === 0) {
    return { error: "At least one recipient is required." };
  }

  let rawBuffer: Buffer;
  try {
    rawBuffer = await buildRawMessage(opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Failed to build email: ${msg}` };
  }
  const raw = base64UrlEncode(rawBuffer);

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[Gmail send] API error:", res.status, text.slice(0, 500));
    if (res.status === 403) {
      const hint = text.includes("disabled") || text.includes("not been used")
        ? " Enable the Gmail API in Google Cloud Console (APIs & Services → Enable APIs) for the project that owns your OAuth client, then reconnect Google in Settings."
        : " Reconnect Google in Settings and grant “Send email” when prompted.";
      return { error: `Gmail could not send (403).${hint}` };
    }
    if (res.status === 401) {
      return { error: "Google sign-in expired. Reconnect Google in Settings, then try again." };
    }
    return { error: text ? `Gmail: ${text.slice(0, 300)}` : `Gmail API error: ${res.status}` };
  }
  return {};
}

/** Send "report ready for approval" from the PM's Gmail. */
export async function sendReportApprovalRequestViaGmail(
  ownerUserId: string,
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string }> {
  if (toEmails.length === 0) return { error: "No recipients" };
  const baseUrl = getAppBaseUrl();
  const reviewUrl = `${baseUrl}/dashboard/project/${projectId}?openReport=${reportId}`;
  const subject = `You have a new report to approve for ${projectName}`;
  const html = `
    <p>You have a new report to approve for <strong>${projectName}</strong>.</p>
    <p>Go to the Valtira PM application to review.</p>
    <p><a href="${reviewUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Review report</a></p>
  `;
  return sendEmailViaGmail(ownerUserId, { to: toEmails, subject, html });
}

/** Send 24h reminder for pending/rejected report from the PM's Gmail. */
export async function sendReportReminderViaGmail(
  ownerUserId: string,
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string }> {
  if (toEmails.length === 0) return { error: "No recipients" };
  const baseUrl = getAppBaseUrl();
  const reviewUrl = `${baseUrl}/dashboard/project/${projectId}?openReport=${reportId}`;
  const subject = `Your report for ${projectName} needs attention`;
  const html = `
    <p>Your report for <strong>${projectName}</strong> needs attention.</p>
    <p>Please have your team correct their time entries and review and approve the report.</p>
    <p><a href="${reviewUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Review report</a></p>
  `;
  return sendEmailViaGmail(ownerUserId, { to: toEmails, subject, html });
}

/** Send team invite email from the super_admin's Gmail. */
export async function sendInviteEmailViaGmail(
  fromUserId: string,
  to: string,
  token: string
): Promise<{ error?: string }> {
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/auth/accept-invite?token=${encodeURIComponent(token)}`;
  const subject = "You're invited to Valtira PM";
  const html = `
    <p>You've been invited to join Valtira PM – project management and client reporting.</p>
    <p><a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Accept invite</a></p>
    <p>Or copy this link: ${acceptUrl}</p>
    <p>This link expires in 7 days. After you accept, you can sign in with Google and connect your Harvest and Jira accounts.</p>
  `;
  return sendEmailViaGmail(fromUserId, { to: [to], subject, html });
}
