import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const KEY = /^[a-z0-9 _-]+$/;

export class UpsertItemDefinitionDto {
  @IsString() @MaxLength(64) @Matches(KEY) itemKey: string;
  @IsString() @MaxLength(128) name: string;
  @IsString() @MaxLength(32) category: string;
  @IsOptional() @IsString() @MaxLength(32) @Matches(KEY) equipSlot?: string | null;
  @Type(() => Number) @IsInt() @Min(1) maxStack: number;
  @IsOptional() @IsString() @MaxLength(64) @Matches(KEY) jobRequired?: string | null;
  @Type(() => Number) @IsInt() @Min(1) minLevel: number;
  @IsOptional() @IsObject() statsBonus?: Record<string, number> | null;
  @IsOptional() @IsString() @MaxLength(64) @Matches(KEY) useAbility?: string | null;
  @IsOptional() @IsObject() metadata?: Record<string, unknown> | null;
}
