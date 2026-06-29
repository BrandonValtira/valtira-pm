import { sendReportApprovalRequestViaGmail, sendReportReminderViaGmail } from "@/lib/gmail-send";
import { sendReportApprovalRequestEmail, sendReportReminderEmail } from "@/lib/invite-email";

/** True when automation should wait for owner approval (default). */
export function automationNeedsApproval(requiresApproval: boolean | null | undefined): boolean {
  return requiresApproval !== false;
}

/** Send approval request via Gmail; fall back to Resend when Gmail fails. */
export async function sendReportApprovalRequest(
  ownerUserId: string,
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string; via?: "gmail" | "resend" }> {
  if (toEmails.length === 0) return { error: "No recipients" };

  const gmail = await sendReportApprovalRequestViaGmail(
    ownerUserId,
    toEmails,
    projectName,
    projectId,
    reportId
  );
  if (!gmail.error) return { via: "gmail" };

  const resend = await sendReportApprovalRequestEmail(toEmails, projectName, projectId, reportId);
  if (!resend.error) return { via: "resend" };

  return { error: `Gmail: ${gmail.error}; Resend: ${resend.error}` };
}

/** Send pending-report reminder via Gmail; fall back to Resend when Gmail fails. */
export async function sendReportReminder(
  ownerUserId: string,
  toEmails: string[],
  projectName: string,
  projectId: string,
  reportId: string
): Promise<{ error?: string; via?: "gmail" | "resend" }> {
  if (toEmails.length === 0) return { error: "No recipients" };

  const gmail = await sendReportReminderViaGmail(ownerUserId, toEmails, projectName, projectId, reportId);
  if (!gmail.error) return { via: "gmail" };

  const resend = await sendReportReminderEmail(toEmails, projectName, projectId, reportId);
  if (!resend.error) return { via: "resend" };

  return { error: `Gmail: ${gmail.error}; Resend: ${resend.error}` };
}
