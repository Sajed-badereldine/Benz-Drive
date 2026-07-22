import { Controller, Post, Body, Get, Query, HttpCode, HttpStatus, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FaDto } from './dto/verify-2fa.dto';
import { Toggle2FaDto } from './dto/toggle-2fa.dto';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setAuthCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('Authentication', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  // 1. POST /auth/signup
  @Post('signup')
  async signUp(@Body() registerDto: RegisterDto) {
    return this.authService.signUp(registerDto);
  }

  // 2. POST /auth/login
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(loginDto);
    const token = (result as any)?.data?.token;
    if (token) {
      this.setAuthCookie(res, token);
    }
    return result;
  }

  // 3. GET /auth/verify?token=...
  @Get('verify')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // 4. POST /auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  // 5. POST /auth/reset-password?token=...
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Query('token') token: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(token, resetPasswordDto.password);
  }

  // 6. POST /auth/verify-2fa
  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactorCode(
    @Body() verify2FaDto: Verify2FaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyTwoFactorCode(verify2FaDto.email, verify2FaDto.code);
    const token = (result as any)?.data?.token;
    if (token) {
      this.setAuthCookie(res, token);
    }
    return result;
  }

  // 7. POST /auth/2fa/toggle
  @Post('2fa/toggle')
  @UseGuards(AuthGuard('jwt')) // Must be logged in to toggle 2FA
  @HttpCode(HttpStatus.OK)
  async toggleTwoFactor(
    @Req() req: any,
    @Body() toggle2FaDto: Toggle2FaDto,
  ) {
    return this.authService.toggleTwoFactor(req.user.id, toggle2FaDto.enable);
  }

  // 8. GET /auth/me (Get current authenticated user info from HttpOnly Cookie)
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Req() req: any) {
    const user = req.user;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  // 9. POST /auth/logout (Clear HttpOnly authentication cookie)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('Authentication', { path: '/' });
    res.clearCookie('token', { path: '/' });
    return { message: 'Signed out successfully' };
  }
}
