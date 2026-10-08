import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard)
@Controller('characters/:characterId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('container') container?: string,
  ): Promise<InventoryItem[]> {
    return this.inventory.list(characterId, user, container);
  }
}
