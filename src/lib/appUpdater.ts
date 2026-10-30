import { registerPlugin } from "@capacitor/core";

export interface AppVersionInfo {
  versionName: string;
  versionCode: number;
}

export interface AppUpdaterPluginInterface {
  getAppVersion(): Promise<AppVersionInfo>;
  downloadAndInstall(options: { url: string }): Promise<{ status: string; downloadId: number }>;
}

export const AppUpdater = registerPlugin<AppUpdaterPluginInterface>("AppUpdater");

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

/**
 * Compare two semver strings like "1.0.5" vs "1.0.6" or "v1.0.5"
 * Returns 1 if b is newer than a, -1 if a is newer, 0 if equal.
 */
export function isNewerVersion(currentVer: string, latestVer: string): boolean {
  const clean = (v: string) => v.replace(/^v/, "").trim();
  const partsA = clean(currentVer).split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = clean(latestVer).split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

/**
 * Fetch latest release from GitHub API
 */
export async function checkGitHubRelease(repoOwner = "see-yaam", repoName = "takaflow-financetracker"): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    const data: GitHubRelease = await res.json();
    return data;
  } catch (err) {
    console.warn("Failed to check GitHub releases:", err);
    return null;
  }
}
