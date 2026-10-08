import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateCharacterPropDto {
  @IsOptional() @IsUUID() inventoryItemId?: string | null;
  @IsString() @MaxLength(64) @Matches(/^[a-z0-9 _-]+$/) propKey: string;
  @IsObject() transform: Record<string, unknown>;
  @IsOptional() @IsBoolean() isMounted?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown> | null;
}
