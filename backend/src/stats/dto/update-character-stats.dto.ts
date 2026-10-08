import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class CharacterStatUpdateDto {
  @IsString() @MaxLength(64) @Matches(/^[a-z0-9 _-]+$/) statKey: string;
  @IsOptional() @Type(() => Number) @IsNumber() baseValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() bonusValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() currentValue?: number;
}

export class UpdateCharacterStatsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => CharacterStatUpdateDto)
  stats: CharacterStatUpdateDto[];
}
