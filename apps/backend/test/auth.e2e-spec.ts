import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import {
  JwtStrategy,
  bearerJwtExtractor,
  cookieJwtExtractor,
} from '../src/auth/strategies/jwt.strategy';
import { LocalStrategy } from '../src/auth/strategies/local.strategy';

describe('Auth (e2e)', () => {
  const seededEmail = 'socio@example.com';
  const seededPassword = 'password123';
  const bootstrapSecret = 'bootstrap_secret';

  let app: any;
  let controller: AuthController;
  let localStrategy: LocalStrategy;
  let jwtStrategy: JwtStrategy;
  let prismaMock: { user: { findUnique: jest.Mock; upsert: jest.Mock } };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.JWT_EXPIRY = '8h';
    process.env.AUTH_BOOTSTRAP_SECRET = bootstrapSecret;

    const passwordHash = await argon2.hash(seededPassword);
    prismaMock = {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { email: string } }) => {
          if (where.email !== seededEmail) return null;
          return { id: 'user_1', email: seededEmail, passwordHash };
        }),
        upsert: jest.fn(async ({ where, create, update }: any) => ({
          id: 'user_bootstrap',
          email: where.email,
          passwordHash: update?.passwordHash ?? create.passwordHash,
        })),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    controller = moduleRef.get(AuthController);
    localStrategy = moduleRef.get(LocalStrategy);
    jwtStrategy = moduleRef.get(JwtStrategy);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('LocalStrategy validates seeded email/password via AuthService', async () => {
    await expect(localStrategy.validate(seededEmail, seededPassword)).resolves.toEqual({
      userId: 'user_1',
      email: seededEmail,
    });
  });

  it('LocalStrategy rejects invalid credentials (UnauthorizedException)', async () => {
    await expect(localStrategy.validate(seededEmail, 'wrongpassword')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('JwtStrategy extracts token from req.cookies.access_token', () => {
    expect(cookieJwtExtractor({ cookies: { access_token: 'token' } } as any)).toBe('token');
    expect(cookieJwtExtractor({ cookies: {} } as any)).toBeNull();
    expect(cookieJwtExtractor({} as any)).toBeNull();
  });

  it('JwtStrategy extracts token from Authorization Bearer header', () => {
    expect(
      bearerJwtExtractor({
        headers: { authorization: 'Bearer header-token' },
      } as any),
    ).toBe('header-token');
    expect(
      bearerJwtExtractor({
        headers: { authorization: 'Basic credentials' },
      } as any),
    ).toBeNull();
    expect(bearerJwtExtractor({ headers: {} } as any)).toBeNull();
  });

  it('JwtStrategy.validate maps payload sub/email to userId/email', async () => {
    await expect(jwtStrategy.validate({ sub: 'user_1', email: seededEmail })).resolves.toEqual({
      userId: 'user_1',
      email: seededEmail,
    });
  });

  it('AuthController.login sets httpOnly access_token cookie with expected flags', async () => {
    const res = { cookie: jest.fn() } as any;
    const result = await controller.login(
      { email: seededEmail, password: seededPassword },
      { user: { userId: 'user_1', email: seededEmail } },
      res,
    );

    expect(result).toEqual({ message: 'ok', accessToken: expect.any(String) });
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = res.cookie.mock.calls[0];
    expect(name).toBe('access_token');
    expect(typeof value).toBe('string');
    expect(result.accessToken).toBe(value);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
      secure: false,
    });
  });

  it('AuthController.logout clears the access_token cookie and returns 200 payload', () => {
    const res = { clearCookie: jest.fn() } as any;
    expect(controller.logout(res)).toEqual({ message: 'ok' });
    expect(res.clearCookie).toHaveBeenCalledWith('access_token');
  });

  it('bootstrap-user rejects requests without the bootstrap secret', async () => {
    await request(app.getHttpServer())
      .post('/auth/bootstrap-user')
      .send({ email: 'admin@example.com', password: 'supersecret123' })
      .expect(403);
  });

  it('bootstrap-user upserts the user with the configured bootstrap secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/bootstrap-user')
      .set('x-bootstrap-secret', bootstrapSecret)
      .send({ email: 'admin@example.com', password: 'supersecret123' })
      .expect(201);

    expect(response.body).toEqual({
      userId: 'user_bootstrap',
      email: 'admin@example.com',
    });
    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.upsert.mock.calls[0][0].where).toEqual({
      email: 'admin@example.com',
    });
    expect(prismaMock.user.upsert.mock.calls[0][0].update.passwordHash).toEqual(
      expect.any(String),
    );
    expect(prismaMock.user.upsert.mock.calls[0][0].create.passwordHash).toEqual(
      expect.any(String),
    );
  });
});
