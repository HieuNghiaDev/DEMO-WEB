const frontendBaseUrl = import.meta.env.BASE_URL;
const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const getEmployeeAvatarImageUrl = (
  avatarPath: string | null | undefined,
) => {
  if (!avatarPath) return undefined;

  if (/^https?:\/\//i.test(avatarPath)) return avatarPath;

  if (avatarPath.startsWith("/storage/") || avatarPath.startsWith("/api/")) {
    return `${backendBaseUrl}${avatarPath}`;
  }

  return `${frontendBaseUrl}${avatarPath.replace(/^\/+/, "")}`;
};
