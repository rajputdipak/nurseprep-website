export const DATABASE_UPDATE_MESSAGE = "The database update is pending. Ask the administrator to run upgrade-platform.sql, then refresh this page. Existing questions and attempts are preserved.";

export function isDatabaseUpdateRequired(error: { code?: string } | null): boolean {
  return Boolean(error && ["42703", "42P01", "PGRST202", "PGRST204"].includes(error.code ?? ""));
}
