import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hola, gracias por escribir.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body: string;
}
