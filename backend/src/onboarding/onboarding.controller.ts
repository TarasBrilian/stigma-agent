import { Body, Controller, Post } from '@nestjs/common';
import {
  OnboardingService,
  type OnboardingResultDto,
} from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('answers')
  submit(@Body() dto: SubmitOnboardingDto): Promise<OnboardingResultDto> {
    return this.onboarding.submit(dto);
  }
}
