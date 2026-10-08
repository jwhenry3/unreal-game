import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, Min } from 'class-validator';

export class PutStateDto {
  @IsDefined()
  value: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
