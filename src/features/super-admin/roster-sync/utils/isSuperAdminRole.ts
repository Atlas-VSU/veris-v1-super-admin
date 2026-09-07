/**
 * Pure authorization decision: does this Firestore `users/{uid}` document
 * grant access to trigger a roster synchronization?
 *
 * Kept separate from the Firebase Admin SDK session-cookie verification
 * (see the route handler) so the actual access-control *rule* — super-admin
 * role, not soft-deleted — can be unit tested without a live Firebase project.
 */
export function isSuperAdminRole(role: unknown, isDeleted: unknown): boolean {
  return role === "super-admin" && isDeleted !== true;
}
