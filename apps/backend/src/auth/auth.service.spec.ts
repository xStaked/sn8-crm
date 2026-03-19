import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const seededUser = {
    id: 'user_1',
    email: 'socio@example.com',
    passwordHash: 'hashed_password',
  };

  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
    };

    jwt = {
      sign: jest.fn(),
    };

    service = new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService);
  });

  it('validateUser returns user object for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(seededUser);
    (argon2.verify as unknown as jest.Mock).mockResolvedValue(true);

    await expect(service.validateUser(seededUser.email, 'correct_password')).resolves.toEqual({
      userId: seededUser.id,
      email: seededUser.email,
    });
  });

  it('validateUser returns null for wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue(seededUser);
    (argon2.verify as unknown as jest.Mock).mockResolvedValue(false);

    await expect(service.validateUser(seededUser.email, 'wrong_password')).resolves.toBeNull();
  });

  it('validateUser returns null for unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.validateUser('unknown@example.com', 'whatever')).resolves.toBeNull();
  });

  it('login returns object with access_token string', async () => {
    jwt.sign.mockReturnValue('jwt_token');

    await expect(
      service.login({ userId: seededUser.id, email: seededUser.email }),
    ).resolves.toEqual({ access_token: 'jwt_token' });
    expect(jwt.sign).toHaveBeenCalledWith({ sub: seededUser.id, email: seededUser.email });
  });
});

