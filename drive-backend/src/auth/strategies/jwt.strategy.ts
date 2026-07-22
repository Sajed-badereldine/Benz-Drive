import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly usersService: UsersService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (req: any) => {
                    if (req?.cookies?.Authentication) return req.cookies.Authentication;
                    if (req?.cookies?.token) return req.cookies.token;
                    // Parse raw cookie header for AWS Lambda Serverless Express
                    const cookieHeader = req?.headers?.cookie || req?.headers?.Cookie;
                    if (cookieHeader) {
                        const match = cookieHeader.match(/(?:^|;\s*)(?:Authentication|token)=([^;]+)/);
                        if (match) return decodeURIComponent(match[1]);
                    }
                    return null;
                },
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('jwt.secret')!,
        });
    }

    async validate(payload: { sub: string; username: string }) {

        const user = await this.usersService.findById(payload.sub);
        if (!user) {
            throw new UnauthorizedException('User not found');
        }
        return user;
    }
}
