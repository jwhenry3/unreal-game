import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const KEY = /^[a-z0-9 _-]+$/;

export class UpsertAbilityDefinitionDto {
  @IsString() @MaxLength(64) @Matches(KEY) abilityKey: string;
  @IsString() @MaxLength(128) name: string;
  @IsString() @MaxLength(32) category: string;
  @Type(() => Number) @IsInt() @Min(0) castTimeMs: number;
  @Type(() => Number) @IsInt() @Min(0) recastMs: number;
  @Type(() => Number) @IsInt() @Min(0) mpCost: number;
  @Type(() => Number) @IsInt() @Min(0) tpCost: number;
  @Type(() => Number) @IsNumber() @Min(0) range: number;
  @IsString() @MaxLength(32) targetType: string;
  @IsOptional() @IsString() @MaxLength(64) @Matches(KEY) jobRequired?: string | null;
  @Type(() => Number) @IsInt() @Min(1) minJobLevel: number;
  @IsString() @MaxLength(64) @Matches(KEY) effectScript: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown> | null;
}
