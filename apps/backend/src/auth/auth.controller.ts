import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Request,
  Response,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthOkResponseDto, AuthUserResponseDto } from './dto/auth-responses.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Iniciar sesion',
    description: 'Autentica al usuario y devuelve la cookie httpOnly `access_token`.',
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
    return { message: 'ok' };
  }

  @ApiOperation({ summary: 'Obtener sesion actual' })
  @ApiCookieAuth('access_token')
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
