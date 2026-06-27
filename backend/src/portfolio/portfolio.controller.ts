import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { RegisterPortfolioDto } from './dto/register-portfolio.dto';
import { StarterDto } from './dto/starter.dto';
import { SuggestDto } from './dto/suggest.dto';
import type { Projection } from '../pricing/pricing.service';
import type {
  PortfolioMetaDto,
  PortfolioStateDto,
  PortfolioSummaryDto,
  RebalanceLogEntryDto,
  StarterPortfolioDto,
  SuggestAllocationResultDto,
} from './portfolio.types';

@Controller('portfolios')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(@Query('owner') owner: string): Promise<PortfolioSummaryDto[]> {
    return this.portfolio.list(owner);
  }

  /** Record the off-chain mirror after a user-signed `create_vault`. */
  @Post()
  register(@Body() dto: RegisterPortfolioDto): Promise<PortfolioMetaDto> {
    return this.portfolio.register(dto);
  }

  @Post('starter')
  starters(@Body() dto: StarterDto): StarterPortfolioDto[] {
    return this.portfolio.generateStarters(dto.profile);
  }

  @Post('suggest')
  suggest(@Body() dto: SuggestDto): Promise<SuggestAllocationResultDto> {
    return this.portfolio.suggest(dto);
  }

  @Get(':vault')
  get(@Param('vault') vault: string): Promise<PortfolioStateDto> {
    return this.portfolio.get(vault);
  }

  @Get(':vault/projection')
  projection(@Param('vault') vault: string): Promise<Projection> {
    return this.portfolio.projection(vault);
  }

  @Get(':vault/activity')
  activity(@Param('vault') vault: string): Promise<RebalanceLogEntryDto[]> {
    return this.portfolio.activity(vault);
  }
}
