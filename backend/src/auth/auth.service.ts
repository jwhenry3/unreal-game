import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthSession } from './entities/auth-session.entity';
import { User } from './entities/user.entity';

export interface AuthRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  sid: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  sessionId: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  user: Omit<AuthenticatedUser, 'sessionId'>;
}

export interface ManagedAccount {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UpdateManagedAccountInput {
  displayName?: string;
  email?: string;
  isActive?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata: AuthRequestMetadata,
  ): Promise<AuthTokenResponse> {
    const username = dto.username.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.username.trim();

    const existing = await this.users.findOne({
      where: [{ username }, { email }],
      select: ['id', 'username', 'email'],
    });

    if (existing) {
      throw new ConflictException('Username or email is already registered.');
    }

    const user = this.users.create({
      username,
      email,
      displayName,
      passwordHash: await bcrypt.hash(dto.password, 12),
      isActive: true,
      lastLoginAt: null,
    });

    try {
      const savedUser = await this.users.save(user);
      return this.createTokenResponse(savedUser, metadata, false);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('Username or email is already registered.');
      }
      throw error;
    }
  }

  async login(
    dto: LoginDto,
    metadata: AuthRequestMetadata,
  ): Promise<AuthTokenResponse> {
    const account = dto.username.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.username) = :account OR LOWER(user.email) = :account', {
        account,
      })
      .getOne();

    const passwordMatches =
      user !== null && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    user.lastLoginAt = new Date();
    const savedUser = await this.users.save(user);
    return this.createTokenResponse(savedUser, metadata, dto.rememberMe === true);
  }

  async refresh(
    dto: RefreshTokenDto,
    metadata: AuthRequestMetadata,
  ): Promise<AuthTokenResponse> {
    const session = await this.sessions.findOne({
      where: { tokenHash: this.hashRefreshToken(dto.refreshToken) },
      relations: { user: true },
    });

    if (!this.isUsableSession(session)) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const refreshToken = this.generateRefreshToken();
    const refreshExpiresIn = this.refreshTtlSeconds(session.rememberMe);

    session.tokenHash = this.hashRefreshToken(refreshToken);
    session.expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);
    session.lastUsedAt = new Date();
    session.ipAddress = metadata.ipAddress ?? session.ipAddress;
    session.userAgent = metadata.userAgent ?? session.userAgent;

    const savedSession = await this.sessions.save(session);
    return this.tokenResponse(savedSession.user, savedSession, refreshToken, refreshExpiresIn);
  }

  async logout(
    dto: LogoutDto,
    authenticatedUser: AuthenticatedUser,
  ): Promise<{ success: true }> {
    const session = dto.refreshToken
      ? await this.sessions.findOne({
          where: { tokenHash: this.hashRefreshToken(dto.refreshToken) },
          relations: { user: true },
        })
      : await this.sessions.findOne({
          where: { id: authenticatedUser.sessionId },
          relations: { user: true },
        });

    if (session && session.user.id === authenticatedUser.id) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }

    return { success: true };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = this.jwtService.verify<AccessTokenPayload>(token);
    return this.validateAccessToken(payload);
  }

  async validateAccessToken(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      relations: { user: true },
    });

    if (!this.isUsableSession(session) || session.user.id !== payload.sub) {
      throw new UnauthorizedException('Access token is no longer valid.');
    }

    return {
      id: session.user.id,
      username: session.user.username,
      email: session.user.email,
      displayName: session.user.displayName,
      sessionId: session.id,
    };
  }

  listServers(): string[] {
    const configured = this.config.get<string>('GAME_SERVERS');
    if (!configured) {
      return ['Local'];
    }

    return configured
      .split(',')
      .map((server) => server.trim())
      .filter(Boolean);
  }

  async listAccounts(search?: string): Promise<ManagedAccount[]> {
    const query = this.users
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.displayName',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
        'user.lastLoginAt',
      ])
      .orderBy('user.createdAt', 'DESC')
      .take(100);

    const term = search?.trim().toLowerCase();
    if (term) {
      query.where(
        '(LOWER(user.username) LIKE :term OR LOWER(user.email) LIKE :term OR LOWER(user.displayName) LIKE :term)',
        { term: `%${term}%` },
      );
    }

    return query.getMany();
  }

  async updateAccount(
    accountId: string,
    input: UpdateManagedAccountInput,
  ): Promise<ManagedAccount> {
    const user = await this.users.findOne({ where: { id: accountId } });
    if (!user) {
      throw new NotFoundException('Account was not found.');
    }

    if (input.displayName !== undefined) {
      user.displayName = input.displayName.trim();
    }
    if (input.email !== undefined) {
      user.email = input.email.trim().toLowerCase() || null;
    }
    if (input.isActive !== undefined) {
      user.isActive = input.isActive;
    }

    try {
      return await this.users.save(user);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException('Email is already registered.');
      }
      throw error;
    }
  }

  private async createTokenResponse(
    user: User,
    metadata: AuthRequestMetadata,
    rememberMe: boolean,
  ): Promise<AuthTokenResponse> {
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresIn = this.refreshTtlSeconds(rememberMe);
    const session = await this.sessions.save(
      this.sessions.create({
        user,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
        rememberMe,
        revokedAt: null,
        lastUsedAt: new Date(),
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      }),
    );

    return this.tokenResponse(user, session, refreshToken, refreshExpiresIn);
  }

  private tokenResponse(
    user: User,
    session: AuthSession,
    refreshToken: string,
    refreshExpiresIn: number,
  ): AuthTokenResponse {
    const expiresIn = this.accessTtlSeconds();
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        username: user.username,
        sid: session.id,
      } satisfies AccessTokenPayload,
      { expiresIn },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }

  private isUsableSession(
    session: AuthSession | null,
  ): session is AuthSession & { user: User } {
    return (
      session !== null &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now() &&
      session.user.isActive
    );
  }

  private accessTtlSeconds(): number {
    return this.positiveInteger('JWT_ACCESS_TTL_SECONDS', 900);
  }

  private refreshTtlSeconds(rememberMe: boolean): number {
    return rememberMe
      ? this.positiveInteger('REMEMBER_ME_REFRESH_TTL_SECONDS', 7_776_000)
      : this.positiveInteger('REFRESH_TOKEN_TTL_SECONDS', 2_592_000);
  }

  private positiveInteger(name: string, fallback: number): number {
    const configured = Number.parseInt(this.config.get<string>(name, ''), 10);
    return Number.isInteger(configured) && configured > 0 ? configured : fallback;
  }

  private generateRefreshToken(): string {
    return randomBytes(64).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
