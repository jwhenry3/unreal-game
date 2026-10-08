import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BatchStateEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  key: string;

  @IsDefined()
  value: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class BatchStateDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchStateEntryDto)
  entries: BatchStateEntryDto[];
}
