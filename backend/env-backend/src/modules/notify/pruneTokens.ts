import { prisma } from '../../database/prisma.js';

/**
 * Expo reports `DeviceNotRegistered` when an app was uninstalled or its token was revoked. Keeping such tokens only wastes
 * sends and hides real delivery problems, so the push sender removes them (best effort; a failure here never affects the send).
 */
export async function pruneDeadTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
}
