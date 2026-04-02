import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

export const cookieJwtExtractor = (req: Request) =>
  req?.cookies?.access_token ?? null;

export const bearerJwtExtractor = (req: Request) =>
  ExtractJwt.fromAuthHeaderAsBearerToken()(req) ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieJwtExtractor,
        bearerJwtExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }): Promise<{
    userId: string;
    email: string;
    role: string;
  }> {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
