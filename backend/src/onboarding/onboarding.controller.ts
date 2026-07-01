import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  OnboardingService,
  type OnboardingResultDto,
} from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import type { QuestionnaireDto } from './questionnaire';
import { WalletAuthGuard } from '../auth/wallet-auth.guard';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Public: the versioned questionnaire the UI renders (no wallet auth — static). */
  @Get('questionnaire')
  questionnaire(): QuestionnaireDto {
    return this.onboarding.getQuestionnaire();
  }

  @Post('answers')
  @UseGuards(WalletAuthGuard)
  submit(@Body() dto: SubmitOnboardingDto): Promise<OnboardingResultDto> {
    return this.onboarding.submit(dto);
  }
}
