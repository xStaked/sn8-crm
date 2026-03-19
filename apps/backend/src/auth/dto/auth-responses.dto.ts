import { ApiProperty } from '@nestjs/swagger';

export class AuthOkResponseDto {
  @ApiProperty({ example: 'ok' })
  message: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT devuelto ademas de la cookie para clientes que autenticen via Bearer.',
  })
  accessToken: string;
}

export class AuthUserResponseDto {
  @ApiProperty({ example: 'user_1' })
  userId: string;

  @ApiProperty({ example: 'socio@example.com' })
  email: string;
}
