import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaceFurnishingDto } from './dto/place-furnishing.dto';
import { UpdateHouseDto } from './dto/update-house.dto';
import { House } from './entities/house.entity';
import { HouseFurnishing } from './entities/house-furnishing.entity';
import { HousingPlot } from './entities/housing-plot.entity';
import { HousingService } from './housing.service';

@Controller()
export class HousingController {
  constructor(private readonly housing: HousingService) {}

  @Get('housing/plots')
  listPlots(
    @Query('realm') realm?: string,
  ): Promise<Array<HousingPlot & { house: House | null }>> {
    return this.housing.listPlots(realm);
  }

  @Get('housing/houses')
  listPublicHouses(@Query('realm') realm?: string): Promise<House[]> {
    return this.housing.listPublicHouses(realm);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/house/claim/:plotId')
  claim(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('plotId', ParseUUIDPipe) plotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<House> {
    return this.housing.claimPlot(characterId, plotId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('characters/:characterId/house')
  get(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<House> {
    return this.housing.getHouse(characterId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('characters/:characterId/house')
  update(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: UpdateHouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<House> {
    return this.housing.updateHouse(characterId, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('characters/:characterId/house')
  release(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    return this.housing.releaseHouse(characterId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('characters/:characterId/house/furnishings')
  placeFurnishing(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Body() dto: PlaceFurnishingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HouseFurnishing> {
    return this.housing.placeFurnishing(characterId, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('characters/:characterId/house/furnishings/:furnishingId')
  removeFurnishing(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @Param('furnishingId', ParseUUIDPipe) furnishingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    return this.housing.removeFurnishing(characterId, furnishingId, user);
  }
}
