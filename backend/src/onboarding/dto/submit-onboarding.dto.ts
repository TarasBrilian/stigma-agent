import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

class OnboardingAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  /** Free-form answer value (string or number). */
  @IsDefined()
  value!: string | number;
}

export class SubmitOnboardingDto {
  /** Owner wallet (public key hex). */
  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingAnswerDto)
  answers!: OnboardingAnswerDto[];

  @IsObject()
  demographics!: Record<string, string | number>;
}
