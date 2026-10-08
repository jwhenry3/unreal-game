import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const NAME_PATTERN = /^[a-zA-Z0-9 _-]+$/;
const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCharacterDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 32)
  @Matches(NAME_PATTERN, {
    message: 'name may only contain letters, numbers, spaces, underscores, and hyphens',
  })
  name: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 64)
  realm: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(NAME_PATTERN)
  job?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(NAME_PATTERN)
  subJob?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(NAME_PATTERN)
  className?: string;
}
