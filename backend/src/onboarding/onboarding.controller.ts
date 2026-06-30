import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  OnboardingService,
  type OnboardingResultDto,
} from './onboarding.service';
import { SubmitOnboardingDto } from './dto/submit-onboarding.dto';
import { WalletAuthGuard } from '../auth/wallet-auth.guard';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('answers')
  @UseGuards(WalletAuthGuard)
  submit(@Body() dto: SubmitOnboardingDto): Promise<OnboardingResultDto> {
    return this.onboarding.submit(dto);
  }
}
