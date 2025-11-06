import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PresenceStatus } from '../entities/presence.entity';
import { UserRole, UserStatus, User } from '../entities/user.entity';
import type { AuthResponseDto, LoginDto, RegisterDto } from '../dto/auth.dto';
import type { UsersService } from '../users/users.service';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PresenceService } from '../presence/presence.service';
const createUserStub = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  password: 'hashed',
  role: UserRole.TEAM_MEMBER,
  status: UserStatus.ACTIVE,
  profilePicture: '',
  phoneNumber: '',
  department: '',
  position: '',
  isEmailVerified: false,
  lastLoginAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ownedProjects: [],
  projects: [],
  assignedTasks: [],
  createdTasks: [],
  comments: [],
  ...overrides,
});

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  const mockUsersService: jest.Mocked<
    Pick<
      UsersService,
      'findByEmail' | 'updateLastLogin' | 'create' | 'findById'
    >
  > = {
    findByEmail: jest.fn(),
    updateLastLogin: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  };

  const mockJwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>> = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService: jest.Mocked<Pick<ConfigService, 'get'>> = {
    get: jest.fn(),
  };

  const mockPresenceService: jest.Mocked<
    Pick<PresenceService, 'setAutomaticStatus'>
  > = {
    setAutomaticStatus: jest.fn(),
  };

  const createService = (): AuthService =>
    new AuthService(
      mockUsersService as unknown as UsersService,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
      mockPresenceService as unknown as PresenceService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: string | null) => {
        if (key === 'jwt.refreshSecret') {
          return 'refresh-secret';
        }
        if (key === 'jwt.refreshExpiresIn') {
          return '7d';
        }
        return defaultValue ?? null;
      },
    );
    mockJwtService.sign.mockImplementation(
      (payload: unknown, options?: unknown) =>
        options ? 'refresh-token' : 'access-token',
    );
  });

  it('logs in a user and updates presence', async () => {
    const service = createService();
    mockUsersService.findByEmail.mockResolvedValue(
      createUserStub({ id: 'user-1' }),
    );

    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'secret',
    };

    const result: AuthResponseDto = await service.login(loginDto);

    expect(mockUsersService.findByEmail).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'hashed');
    expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith('user-1');
    expect(mockPresenceService.setAutomaticStatus).toHaveBeenCalledWith(
      'user-1',
      PresenceStatus.ONLINE,
    );
    expect(result).toEqual(
      expect.objectContaining({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: expect.objectContaining({ id: 'user-1' }),
      }),
    );
  });

  it('throws for invalid credentials', async () => {
    const service = createService();
    mockUsersService.findByEmail.mockResolvedValue(null);

    const loginDto: LoginDto = {
      email: 'missing@example.com',
      password: 'whatever',
    };

    await expect(service.login(loginDto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockUsersService.updateLastLogin).not.toHaveBeenCalled();
  });

  it('returns null when refresh token verification fails', async () => {
    const service = createService();
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid');
    });

    await expect(service.refreshToken('bad-token')).resolves.toBeNull();
  });

  it('prevents registering duplicate emails', async () => {
    const service = createService();
    mockUsersService.findByEmail.mockResolvedValueOnce(
      createUserStub({ id: 'existing' }),
    );

    await expect(
      service.register({
        email: 'duplicate@example.com',
        password: 'secret',
        firstName: 'Dupe',
        lastName: 'User',
      } satisfies RegisterDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('registers a new user and returns tokens', async () => {
    const service = createService();
    mockUsersService.findByEmail.mockResolvedValueOnce(null);
    mockUsersService.create.mockResolvedValue(
      createUserStub({
        id: 'new-user',
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'User',
      }),
    );

    const registerDto: RegisterDto = {
      email: 'new@example.com',
      password: 'secret',
      firstName: 'New',
      lastName: 'User',
    };

    const result = await service.register(registerDto);

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    expect(mockUsersService.create).toHaveBeenCalled();
    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toBe('refresh-token');
    expect(result.user.id).toBe('new-user');
  });
});
