import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<{ userId: string; email: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) return null;

    return { userId: user.id, email: user.email };
  }

  async login(user: {
    userId: string;
    email: string;
  }): Promise<{ access_token: string }> {
    const payload = { sub: user.userId, email: user.email };
    return { access_token: this.jwt.sign(payload) };
  }

  async bootstrapUser(email: string, password: string): Promise<{ userId: string; email: string }> {
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    return { userId: user.id, email: user.email };
  }
}
