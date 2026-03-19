import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'socio@example.com',
    description: 'Correo del usuario registrado en el CRM.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'password123',
    minLength: 8,
    description: 'Contrasena del usuario.',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
