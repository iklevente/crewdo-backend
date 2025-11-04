import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../entities';
import { PresenceService } from '../presence/presence.service';
import { PresenceStatus } from '../entities/presence.entity';
import { LoginDto, RegisterDto, AuthResponseDto } from '../dto/auth.dto';

interface JwtPayload {
  email: string;
  sub: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly presenceService: PresenceService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.generateRefreshToken(payload);

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    try {
      await this.presenceService.setAutomaticStatus(
        user.id,
        PresenceStatus.ONLINE,
      );
    } catch (error) {
      console.warn(
        `Failed to set presence online for user ${user.id}: ${String(error)}`,
      );
    }

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);

    const userData = {
      ...registerDto,
      password: hashedPassword,
    };

    const user = await this.usersService.create(userData);

    // Generate tokens
    const payload = { email: user.email, sub: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.generateRefreshToken(payload);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  generateRefreshToken(payload: JwtPayload): string {
    const secret = this.configService.get<string>(
      'jwt.refreshSecret',
      'jwt_refresh_secret',
    );
    const expiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );

    return this.jwtService.sign(payload, {
      secret,
      expiresIn,
    });
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ access_token: string } | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>(
          'jwt.refreshSecret',
          'jwt_refresh_secret',
        ),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = { email: user.email, sub: user.id, role: user.role };
      const access_token = this.jwtService.sign(newPayload);

      return { access_token };
    } catch {
      // Invalid token
      return null;
    }
  }
}
