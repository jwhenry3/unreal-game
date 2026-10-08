import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(3, 64)
  username: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serverName?: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
