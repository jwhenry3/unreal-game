import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class PutCharacterAbilityDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rank?: number;
  @IsOptional() @IsBoolean() isUnlocked?: boolean;
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[a-z0-9 _-]+$/) sourceJob?: string | null;
  @IsOptional() @IsDateString() cooldownAt?: string | null;
}
