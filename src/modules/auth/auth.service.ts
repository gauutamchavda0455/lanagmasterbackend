import {
  Injectable,
  Inject,
  forwardRef,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AccessToken } from './entities/access-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';
import { comparePassword } from '../../common/utils/hash.util';
import { generateToken, hashSha256 } from '../../common/utils/crypto.util';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async login(user: User) {
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await comparePassword(password, user.password))) {
      return user;
    }
    return null;
  }

  async refreshTokens(refreshToken: string) {
    const refreshHash = hashSha256(refreshToken);
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshHash, isRevoked: false },
    });

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    tokenRecord.isRevoked = true;
    await this.refreshTokenRepository.save(tokenRecord);

    const user = await this.usersService.findOne(tokenRecord.userId);
    return this.generateTokens(user);
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    const resetToken = generateToken();
    // TODO: Save reset token and send email
    return { message: 'Password reset email sent', resetToken };
  }

  async resetPassword(token: string, password: string) {
    // TODO: Validate reset token and update password
    return { message: 'Password reset successfully' };
  }

  async logout(userId: string) {
    await this.accessTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(user: User) {
    const rawAccessToken = generateToken(48);
    const rawRefreshToken = generateToken(48);

    const accessTokenHash = hashSha256(rawAccessToken);
    const refreshTokenHash = hashSha256(rawRefreshToken);

    const accessExpiresIn = this.configService.get<string>('jwt.expiresIn') ?? '15m';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const accessTokenEntity = this.accessTokenRepository.create({
      tokenHash: accessTokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + this.parseDuration(accessExpiresIn)),
    });
    await this.accessTokenRepository.save(accessTokenEntity);

    const refreshTokenEntity = this.refreshTokenRepository.create({
      token: refreshTokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + this.parseDuration(refreshExpiresIn)),
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    return { accessToken: rawAccessToken, refreshToken: rawRefreshToken };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) return 15 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }
}
