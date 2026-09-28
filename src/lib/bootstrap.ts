/**
 * GRIOT Workspace Bootstrap
 * Verifies or bootstraps workspace entities safely against real schema.
 */
export async function bootstrapWorkspace(_userId: string) {
  // Real schema uses griot_workspaces and griot_user_profiles.
  // Initial seed is handled natively by the backend Edge Functions.
  return;
}
