import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService current profile', () => {
  it('queries only the authenticated user and selects no auth secrets', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'current-user',
      email: 'current@example.com',
      firstName: 'Current',
      lastName: 'User',
      status: 'ACTIVE',
      platformRole: null,
      tenantMemberships: [],
    });
    const prisma = {
      user: { findUniqueOrThrow },
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.me({
      userId: 'current-user',
      email: 'current@example.com',
      platformRole: null,
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'current-user' } }),
    );
    const select = (
      findUniqueOrThrow.mock.calls as Array<
        [
          {
            select: Record<string, unknown> & {
              tenantMemberships: { select: Record<string, unknown> };
            };
          },
        ]
      >
    )[0][0].select;
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('authSessions');
    expect(select).not.toHaveProperty('passwordResets');
    expect(select.tenantMemberships.select).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('passwordHash');
  });
});
