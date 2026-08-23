import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { AuthenticatedUser } from './types/authenticated-user';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Sign in' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Rotate a refresh session' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(this.readCookie(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken };
  }
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(this.readCookie(request, false));
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return { message: 'Signed out.' };
  }
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request password reset instructions' })
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return {
      message:
        'If an account exists for that email, password reset instructions will be sent.',
    };
  }
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset a password' })
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { message: 'Password reset successfully.' };
  }
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the current user password and revoke all sessions',
  })
  async change(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(user.userId, dto);
    response.clearCookie(this.cookieName(), this.cookieOptions());
    return { message: 'Password changed. Please sign in again.' };
  }
  private cookieName(): string {
    return (
      this.config.get<string>('AUTH_REFRESH_COOKIE_NAME') ?? 'aiva_refresh'
    );
  }
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('AUTH_COOKIE_SECURE') ?? false,
      sameSite: this.config.get<'strict' | 'lax' | 'none'>(
        'AUTH_COOKIE_SAME_SITE',
        'lax',
      ),
      path: '/api/v1/auth',
    };
  }
  private setRefreshCookie(response: Response, token: string) {
    const raw = this.config.get<string>('JWT_REFRESH_TTL') ?? '14d';
    const match = /^(\d+)([smhd])$/.exec(raw);
    const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 } as const;
    const maxAge = match
      ? Number(match[1]) * unit[match[2] as keyof typeof unit]
      : 14 * unit.d;
    response.cookie(this.cookieName(), token, {
      ...this.cookieOptions(),
      maxAge,
    });
  }
  private readCookie(request: Request, required = true): string {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[this.cookieName()];
    const token = typeof value === 'string' ? value : undefined;
    if (!token && required) return '';
    return token ?? '';
  }
}
