const frontendBaseUrl = import.meta.env.BASE_URL;
const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const getEmployeeAvatarUrl = (
  avatarPath: string | null | undefined,
  gender?: string | null,
) => {
  const fallbackPath = gender === "female" ? "/images/girl.png" : "/images/boy.png";
  const path = avatarPath || fallbackPath;

  if (/^https?:\/\//i.test(path)) return path;

  if (path.startsWith("/storage/")) {
    return `${backendBaseUrl}${path}`;
  }

  return `${frontendBaseUrl}${path.replace(/^\/+/, "")}`;
};
