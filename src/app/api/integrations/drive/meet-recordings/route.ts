import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { NextResponse } from "next/server";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/** True if the Google API response indicates expired/invalid credentials. */
function isGoogleAuthError(status: number, message: string): boolean {
  if (status === 401 || status === 403) return true;
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid authentication") ||
    lower.includes("invalid credentials") ||
    lower.includes("expected oauth") ||
    lower.includes("token expired") ||
    lower.includes("invalid_grant")
  );
}

/** List Google Docs in the user's "Meet Recordings" folder (My Drive). */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await getGoogleAccessToken(userId);
  if (!token) {
    return NextResponse.json(
      { error: "Google Drive not connected. Connect on the dashboard." },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();

  try {
    // Find "Meet Recordings" folder: first try root-only (most reliable), then drive-wide if empty
    const rootQuery = encodeURIComponent(
      "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    );
    const folderRes = await fetch(
      `${DRIVE_FILES}?q=${rootQuery}&fields=files(id,name)&pageSize=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!folderRes.ok) {
      const errText = await folderRes.text();
      let errJson: { error?: { message?: string; status?: string } } = {};
      try {
        errJson = JSON.parse(errText);
      } catch {
        // keep errText as-is
      }
      const message =
        errJson?.error?.message || errText.slice(0, 200) || folderRes.statusText;
      if (isGoogleAuthError(folderRes.status, message)) {
        await supabase
          .from("user_integrations")
          .delete()
          .eq("user_id", userId)
          .eq("provider", "google_drive");
        return NextResponse.json(
          {
            error: "Google Drive connection expired or was revoked. Reconnect on the dashboard.",
            authExpired: true,
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Could not list Drive folders. Reconnect Google Drive on the dashboard.", details: message },
        { status: 502 }
      );
    }
    const folderData = (await folderRes.json()) as { files?: { id: string; name: string }[] };
    const folders = folderData.files ?? [];
    let folder = folders.find(
      (f) =>
        f.name.toLowerCase().includes("meet") && f.name.toLowerCase().includes("recording")
    );
    if (!folder) {
      // Fallback: search drive-wide for folder (no corpora to avoid 403)
      const driveWideRes = await fetch(
        `${DRIVE_FILES}?q=${encodeURIComponent("name contains 'Meet' and name contains 'Recording' and mimeType = 'application/vnd.google-apps.folder' and trashed = false")}&fields=files(id,name)&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!driveWideRes.ok) {
        const errText = await driveWideRes.text();
        let errJson: { error?: { message?: string } } = {};
        try {
          errJson = JSON.parse(errText);
        } catch {
          // keep errText as-is
        }
        const wideMessage = errJson?.error?.message || errText.slice(0, 200) || "";
        if (isGoogleAuthError(driveWideRes.status, wideMessage)) {
          await supabase
            .from("user_integrations")
            .delete()
            .eq("user_id", userId)
            .eq("provider", "google_drive");
          return NextResponse.json(
            {
              error: "Google Drive connection expired or was revoked. Reconnect on the dashboard.",
              authExpired: true,
            },
            { status: 401 }
          );
        }
      }
      if (driveWideRes.ok) {
        const wideData = (await driveWideRes.json()) as { files?: { id: string; name: string }[] };
        const wideFolders = wideData.files ?? [];
        folder = wideFolders.find(
          (f) =>
            f.name.toLowerCase().includes("meet") && f.name.toLowerCase().includes("recording")
        );
      }
    }
    if (!folder) {
      return NextResponse.json({ files: [], folderName: null });
    }

    // List all files in folder: Google Docs and shortcuts (.gdoc sync files are shortcuts)
    const listRes = await fetch(
      `${DRIVE_FILES}?q=${encodeURIComponent(`'${folder.id}' in parents and trashed = false`)}&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,modifiedTime,mimeType,shortcutDetails)&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!listRes.ok) {
      const errText = await listRes.text();
      let errJson: { error?: { message?: string } } = {};
      try {
        errJson = JSON.parse(errText);
      } catch {
        // keep errText as-is
      }
      const listMessage = errJson?.error?.message || errText.slice(0, 200) || "";
      if (isGoogleAuthError(listRes.status, listMessage)) {
        await supabase
          .from("user_integrations")
          .delete()
          .eq("user_id", userId)
          .eq("provider", "google_drive");
        return NextResponse.json(
          {
            error: "Google Drive connection expired or was revoked. Reconnect on the dashboard.",
            authExpired: true,
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Could not list files in folder.", details: errText, folderId: folder.id, folderName: folder.name },
        { status: 502 }
      );
    }
    const listData = (await listRes.json()) as {
      files?: {
        id: string;
        name: string;
        modifiedTime?: string;
        mimeType?: string;
        shortcutDetails?: { targetId: string; targetMimeType?: string };
      }[];
    };
    const DOC_MIME = "application/vnd.google-apps.document";
    const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
    const files: { id: string; name: string; modifiedTime: string | null }[] = [];
    const rawFiles = listData.files ?? [];
    for (const f of rawFiles) {
      if (f.mimeType === DOC_MIME) {
        files.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null });
      } else if (f.mimeType === SHORTCUT_MIME && f.shortcutDetails?.targetId) {
        const name = f.name.replace(/\.gdoc$/i, "") || f.name;
        files.push({
          id: f.shortcutDetails.targetId,
          name,
          modifiedTime: f.modifiedTime ?? null,
        });
      }
    }
    return NextResponse.json({
      files,
      folderName: folder.name,
      folderId: folder.id,
      rawCount: rawFiles.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Google Drive request failed. Reconnect on the dashboard if this persists." },
      { status: 502 }
    );
  }
}
