import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  AuthRequestMetadata,
  AuthService,
  AuthTokenResponse,
  AuthenticatedUser,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('servers')
  servers(): { servers: string[] } {
    return { servers: this.authService.listServers() };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<AuthTokenResponse> {
    return this.authService.register(dto, this.requestMetadata(request));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthTokenResponse> {
    return this.authService.login(dto, this.requestMetadata(request));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<AuthTokenResponse> {
    return this.authService.refresh(dto, this.requestMetadata(request));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: Request & { user: AuthenticatedUser }): AuthenticatedUser {
    return request.user;
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(
    @Body() dto: LogoutDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ): Promise<{ success: true }> {
    return this.authService.logout(dto, request.user);
  }

  private requestMetadata(request: Request): AuthRequestMetadata {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim() ?? request.ip;

    return {
      ipAddress,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }
}
