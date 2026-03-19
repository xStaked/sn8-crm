import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { BootstrapUserDto } from './dto/bootstrap-user.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthOkResponseDto, AuthUserResponseDto } from './dto/auth-responses.dto';
import { BootstrapUserResponseDto } from './dto/bootstrap-user-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Bootstrap de usuario',
    description:
      'Crea o actualiza el usuario inicial usando un secreto administrativo enviado por header.',
  })
  @ApiHeader({
    name: 'x-bootstrap-secret',
    required: true,
    description: 'Debe coincidir con AUTH_BOOTSTRAP_SECRET del backend.',
  })
  @ApiBody({ type: BootstrapUserDto })
  @ApiCreatedResponse({
    description: 'Usuario creado o actualizado.',
    type: BootstrapUserResponseDto,
  })
  @ApiForbiddenResponse({ description: 'El secreto administrativo es invalido o no esta configurado.' })
  @Post('bootstrap-user')
  async bootstrapUser(
    @Body() dto: BootstrapUserDto,
    @Request() req: { headers: { ['x-bootstrap-secret']?: string } },
  ) {
    const configuredSecret = process.env.AUTH_BOOTSTRAP_SECRET;
    const providedSecret = req.headers['x-bootstrap-secret'];

    if (!configuredSecret || providedSecret !== configuredSecret) {
      throw new ForbiddenException();
    }

    return this.authService.bootstrapUser(dto.email, dto.password);
  }

  @ApiOperation({
    summary: 'Iniciar sesion',
    description:
      'Autentica al usuario, devuelve la cookie httpOnly `access_token` y tambien el token en el body.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Sesion iniciada correctamente.',
    type: AuthOkResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Credenciales invalidas.' })
  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  async login(
    @Body() _loginDto: LoginDto,
    @Request() req: { user: { userId: string; email: string } },
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const { access_token } = await this.authService.login(req.user);
    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });
    return { message: 'ok', accessToken: access_token };
  }

  @ApiOperation({ summary: 'Obtener sesion actual' })
  @ApiCookieAuth('access_token')
  @ApiBearerAuth('access_token_bearer')
  @ApiOkResponse({
    description: 'Usuario autenticado.',
    type: AuthUserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'La cookie de sesion es invalida o no existe.' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user: { userId: string; email: string } }) {
    return req.user;
  }

  @ApiOperation({ summary: 'Cerrar sesion' })
  @ApiOkResponse({
    description: 'Sesion cerrada y cookie eliminada.',
    type: AuthOkResponseDto,
  })
  @Delete('logout')
  logout(@Response({ passthrough: true }) res: ExpressResponse) {
    res.clearCookie('access_token');
    return { message: 'ok' };
  }
}
