import { Injectable, ConflictException, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
    ) { }

    async signUp(registerDto: RegisterDto) {
        const { email, username, password } = registerDto;

        const existingUser = await this.userRepo.findOne({ where: { email } });
        if (existingUser) {
            throw new ConflictException('Email already registered');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

        const user = this.userRepo.create({
            email,
            username,
            password: hashedPassword,
            isVerified: false,
            verificationToken,
            verificationTokenExpires,
        });
        const savedUser = await this.userRepo.save(user);
        try {
            await this.mailService.sendVerificationEmail(savedUser.email, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
        }

        const { password: _, ...userWithoutPassword } = savedUser;
        return {
            message: 'Registration successful! Please check your email to verify your account (link expires in 15 minutes).',
            user: userWithoutPassword,
        };
    }

    async verifyEmail(token: string) {
        const user = await this.userRepo.findOne({
            where: {
                verificationToken: token,
                verificationTokenExpires: MoreThan(new Date()),
            },
        });

        if (!user) {
            throw new BadRequestException('Invalid or expired verification token');
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await this.userRepo.save(user);

        return {
            message: 'Email successfully verified! You can now log in.',
        };
    }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        const user = await this.userRepo.findOne({
            where: { email: loginDto.email },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Block users who haven't verified their email
        if (!user.isVerified) {
            throw new UnauthorizedException('Email not verified. Please check your inbox.');
        }

        // Check if 2FA is enabled for this user
        if (user.isTwoFactorEnabled) {
            const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
            const twoFactorCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            user.twoFactorCode = twoFactorCode;
            user.twoFactorCodeExpires = twoFactorCodeExpires;
            await this.userRepo.save(user);

            try {
                await this.mailService.sendTwoFactorCodeEmail(user.email, twoFactorCode);
            } catch (error) {
                console.error('Failed to send 2FA email:', error);
                throw new BadRequestException('Failed to send 2FA verification code. Please try again.');
            }

            return {
                requires2FA: true,
                email: user.email,
                message: 'Two-factor authentication code sent to your email.',
            };
        }

        const token = this.signUserToken(user);
        return {
            message: "Welcome back! You're signed in.",
            data: { token, user: this.sanitizeUser(user) },
        };
    }

    async forgotPassword(email: string) {
        const user = await this.userRepo.findOne({ where: { email } });

        if (!user) {
            return {
                message: 'If this email is registered, a password reset link has been sent.',
            };
        }

        const resetPasswordToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpires = resetPasswordExpires;
        await this.userRepo.save(user);

        try {
            await this.mailService.sendPasswordResetEmail(user.email, resetPasswordToken);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw new BadRequestException('Failed to send password reset link. Please try again.');
        }

        return {
            message: 'If this email is registered, a password reset link has been sent.',
        };
    }

    async resetPassword(token: string, newPassword: string) {
        const user = await this.userRepo.findOne({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: MoreThan(new Date()),
            },
        });

        if (!user) {
            throw new BadRequestException('Invalid or expired password reset token');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await this.userRepo.save(user);

        return {
            message: 'Password successfully reset! You can now log in with your new password.',
        };
    }

    // 6. Verify 2FA code
    async verifyTwoFactorCode(email: string, code: string) {
        const user = await this.userRepo.findOne({
            where: { email },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid user');
        }

        if (!user.isTwoFactorEnabled) {
            throw new BadRequestException('Two-factor authentication is not enabled for this account');
        }

        if (user.twoFactorCode !== code || !user.twoFactorCodeExpires || user.twoFactorCodeExpires < new Date()) {
            throw new UnauthorizedException('Invalid or expired 2FA code');
        }

        // Clear 2FA code
        user.twoFactorCode = null;
        user.twoFactorCodeExpires = null;
        await this.userRepo.save(user);

        // Generate and return JWT session token
        const token = this.signUserToken(user);
        return {
            message: "Welcome back! You're signed in.",
            data: { token, user: this.sanitizeUser(user) },
        };
    }

    // 7. Toggle 2FA settings
    async toggleTwoFactor(userId: string, enable: boolean) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        user.isTwoFactorEnabled = enable;
        await this.userRepo.save(user);

        return {
            message: `Two-factor authentication successfully ${enable ? 'enabled' : 'disabled'}.`,
        };
    }

    // Helper functions 
    private signUserToken(user: User) {
        return this.jwtService.sign({ sub: user.id, username: user.username });
    }

    private sanitizeUser(user: User) {
        if (!user)
            return null;
        const {
            password,
            ...safeUser
        } = user as any;

        return safeUser;
    }
}
