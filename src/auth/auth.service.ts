import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash as argonHash, verify as argonVerify, argon2id } from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  normalizeEmail,
  safeUserSelect,
  UsersService,
} from '../users/users.service';
import { assertPasswordPolicy } from './password-policy';
import { ChangePasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';
import {
  AccessClaims,
  AuthenticatedUser,
  RefreshClaims,
} from './types/authenticated-user';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const ttlMs = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid TTL: ${value}`);
  return (
    Number(match[1]) *
    ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as const)[
      match[2] as 's' | 'm' | 'h' | 'd'
    ]
  );
};
const invalidCredentials = () =>
  new UnauthorizedException('Invalid email or password.');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}
  async login(dto: LoginDto) {
    const user = await this.users.findForAuthentication(dto.email);
    if (
      !user ||
      !(await argonVerify(user.passwordHash, dto.password).catch(() => false))
    )
      throw invalidCredentials();
    if (user.status !== 'ACTIVE')
      throw new UnauthorizedException('Account access unavailable.');
    const tokens = await this.createSession(
      user.id,
      user.email,
      user.platformRole,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const safeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      platformRole: user.platformRole,
      status: user.status,
    };
    return { ...tokens, user: safeUser };
  }
  async refresh(rawToken: string) {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(rawToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
      if (claims.type !== 'refresh') throw new Error('Wrong token type');
      const session = await this.prisma.authSession.findUnique({
        where: { id: claims.sid },
        include: { user: true },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== 'ACTIVE' ||
        session.refreshTokenHash !== digest(rawToken)
      )
        throw new Error('Invalid session');
      const revoked = await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new Error('Token already rotated');
      return this.createSession(
        session.user.id,
        session.user.email,
        session.user.platformRole,
      );
    } catch {
      throw new UnauthorizedException('Authentication required.');
    }
  }
  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(rawToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        ignoreExpiration: true,
      });
      await this.prisma.authSession.updateMany({
        where: {
          id: claims.sid,
          refreshTokenHash: digest(rawToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }
  async me(user: AuthenticatedUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.userId },
      select: {
        ...safeUserSelect,
        tenantMemberships: {
          select: {
            role: true,
            status: true,
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findForAuthentication(normalizeEmail(email));
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomBytes(32).toString('base64url');
    const minutes = this.config.get<number>('PASSWORD_RESET_TTL_MINUTES', 45);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + minutes * 60000),
      },
    });
    await this.mail.sendPasswordReset(user.email, token);
  }
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    assertPasswordPolicy(dto.newPassword);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: digest(dto.token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date())
      throw new UnauthorizedException(
        'This password reset link is invalid or expired.',
      );
    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    assertPasswordPolicy(dto.newPassword);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      !(await argonVerify(user.passwordHash, dto.currentPassword).catch(
        () => false,
      ))
    )
      throw invalidCredentials();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await this.hashPassword(dto.newPassword) },
      }),
      this.prisma.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
  hashPassword(password: string) {
    assertPasswordPolicy(password);
    return argonHash(password, { type: argon2id });
  }
  private async createSession(
    userId: string,
    email: string,
    platformRole: AccessClaims['platformRole'],
  ) {
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '14d';
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: 'pending',
        expiresAt: new Date(Date.now() + ttlMs(refreshTtl)),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, platformRole, type: 'access' },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ??
          '15m') as never,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, type: 'refresh' },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl as never,
      },
    );
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: digest(refreshToken) },
    });
    return { accessToken, refreshToken };
  }
}
