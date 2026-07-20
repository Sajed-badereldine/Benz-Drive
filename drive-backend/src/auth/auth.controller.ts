import { Controller, Post, Body, Get, Query, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Verify2FaDto } from './dto/verify-2fa.dto';
import { Toggle2FaDto } from './dto/toggle-2fa.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 1. POST /auth/signup
  @Post('signup')
  async signUp(@Body() registerDto: RegisterDto) {
    return this.authService.signUp(registerDto);
  }

  // 2. POST /auth/login
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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
  async verifyTwoFactorCode(@Body() verify2FaDto: Verify2FaDto) {
    return this.authService.verifyTwoFactorCode(verify2FaDto.email, verify2FaDto.code);
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
}
