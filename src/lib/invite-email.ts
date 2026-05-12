import { Resend } from "resend";
import { getAppBaseUrl } from "@/lib/app-url";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendInviteEmail(to: string, token: string): Promise<{ error?: string }> {
  if (!resend) return { error: "Email not configured (RESEND_API_KEY)" };
  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/auth/accept-invite?token=${encodeURIComponent(token)}`;
  const from = process.env.RESEND_FROM ?? "Valtira PM <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "You're invited to Valtira PM",
    html: `
      <p>You've been invited to join Valtira PM – project management and client reporting.</p>
      <p><a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Accept invite</a></p>
      <p>Or copy this link: ${acceptUrl}</p>
      <p>This link expires in 7 days. After you accept, you can sign in with Google and connect your Harvest and Jira accounts.</p>
    `,
  });
  return error ? { error: error.message } : {};
}

/** Send "report ready for approval" email to given addresses. Link opens project with report modal. */
export async function sendReportApprovalRequestEmail(
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string }> {
  if (!resend || toEmails.length === 0) return { error: "Email not configured or no recipients" };
  const baseUrl = getAppBaseUrl();
  const reviewUrl = `${baseUrl}/dashboard/project/${projectId}?openReport=${reportId}`;
  const from = process.env.RESEND_FROM ?? "Valtira PM <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: toEmails,
    subject: `You have a new report to approve for ${projectName}`,
    html: `
      <p>You have a new report to approve for <strong>${projectName}</strong>.</p>
      <p>Go to the Valtira PM application to review.</p>
      <p><a href="${reviewUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Review report</a></p>
    `,
  });
  return error ? { error: error.message } : {};
}

/** Send 24h reminder for rejected or still-pending report. */
export async function sendReportReminderEmail(
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string }> {
  if (!resend || toEmails.length === 0) return { error: "Email not configured or no recipients" };
  const baseUrl = getAppBaseUrl();
  const reviewUrl = `${baseUrl}/dashboard/project/${projectId}?openReport=${reportId}`;
  const from = process.env.RESEND_FROM ?? "Valtira PM <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: toEmails,
    subject: `Your report for ${projectName} needs attention`,
    html: `
      <p>Your report for <strong>${projectName}</strong> needs attention.</p>
      <p>Please have your team correct their time entries and review and approve the report.</p>
      <p><a href="${reviewUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Review report</a></p>
    `,
  });
  return error ? { error: error.message } : {};
}

/** Send report to client (with optional PDF attachment). Same Resend templates/config as approval/reminder. */
export async function sendReportToClientEmail(
  to: string[],
  cc: string[],
  subject: string,
  html: string,
  attachments?: { filename: string; content: Buffer }[]
): Promise<{ error?: string }> {
  if (!resend || to.length === 0) return { error: "Email not configured or no recipients" };
  const from = process.env.RESEND_FROM ?? "Valtira PM <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    subject,
    html,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  return error ? { error: error.message } : {};
}
