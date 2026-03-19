import { ApiProperty } from '@nestjs/swagger';

export class AuthOkResponseDto {
  @ApiProperty({ example: 'ok' })
  message: string;
}

export class AuthUserResponseDto {
  @ApiProperty({ example: 'user_1' })
  userId: string;

  @ApiProperty({ example: 'socio@example.com' })
  email: string;
}
