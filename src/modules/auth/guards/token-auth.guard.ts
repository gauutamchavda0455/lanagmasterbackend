import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessToken } from '../entities/access-token.entity';
import { User } from '../../users/entities/user.entity';
import { hashSha256 } from '../../../common/utils/crypto.util';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ERROR_MESSAGES } from '../../../common/constants/error-messages';

@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AccessToken)
    private readonly accessTokenRepository: Repository<AccessToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    const tokenHash = hashSha256(token);
    const accessToken = await this.accessTokenRepository.findOne({
      where: { tokenHash, isRevoked: false },
    });

    if (!accessToken || accessToken.expiresAt < new Date()) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    const user = await this.userRepository.findOne({
      where: { id: accessToken.userId },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    request.user = user;
    return true;
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
