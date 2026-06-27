import { IsNotEmpty, IsString } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  vaultHash!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
