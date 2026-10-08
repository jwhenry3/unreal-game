import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCharacterStateDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mapName?: string;

  @IsOptional()
  @IsObject()
  position?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;
}
