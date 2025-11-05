import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

const mockedCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;
const mockedHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

describe('UsersService', () => {
  const buildService = () => {
    const userRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const dataSource: Partial<DataSource> = {
      getRepository: jest.fn().mockReturnValue(userRepository),
    };

    const service = new UsersService(dataSource as DataSource);

    return {
      service,
      userRepository,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new user with active status', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValueOnce(null);
    const createdUser = { id: 'user-1', email: 'test@example.com' } as User;
    userRepository.create.mockReturnValue(createdUser);
    userRepository.save.mockResolvedValue(createdUser);

    const createDto: CreateUserDto = {
      email: 'test@example.com',
      password: 'secret',
      firstName: 'Test',
      lastName: 'User',
    };

    const createPromise = service.create(createDto);
    const expectation: Promise<void> =
      expect(createPromise).resolves.toBe(createdUser);

    await expectation;

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        status: expect.anything(),
      }),
    );
  });

  it('blocks duplicate registrations', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValueOnce({ id: 'existing' });

    const createDto: CreateUserDto = {
      email: 'exists@example.com',
      password: 'secret',
      firstName: 'Test',
      lastName: 'User',
    };
    await expect(service.create(createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws when updating missing user', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValue(null);

    const updateDto: UpdateUserDto = { firstName: 'New' };
    await expect(service.update('user-1', updateDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates user details when found', async () => {
    const { service, userRepository } = buildService();

    const user = { id: 'user-1', firstName: 'Old' };
    const updated = { id: 'user-1', firstName: 'New' };

    userRepository.findOne
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(updated);

    const updateDto: UpdateUserDto = { firstName: 'New' };
    const result = await service.update('user-1', updateDto);

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      firstName: 'New',
    });
    expect(result).toBe(updated);
  });

  it('changes password when current password matches', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      password: 'hashed',
    });

    mockedCompare.mockResolvedValue(true as never);
    mockedHash.mockResolvedValue('new-hash' as never);

    await service.changePassword('user-1', {
      currentPassword: 'old',
      newPassword: 'new',
    });

    expect(bcrypt.compare).toHaveBeenCalledWith('old', 'hashed');
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      password: 'new-hash',
    });
  });

  it('rejects incorrect current password', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      password: 'hash',
    });
    mockedCompare.mockResolvedValue(false as never);

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'wrong',
        newPassword: 'new',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivates a user after validation', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValue({ id: 'user-1' });

    await service.deactivate('user-1');

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      status: expect.anything(),
    });
  });

  it('deletes an existing user', async () => {
    const { service, userRepository } = buildService();

    userRepository.findOne.mockResolvedValue({ id: 'user-1' });

    await service.remove('user-1');

    expect(userRepository.delete).toHaveBeenCalledWith('user-1');
  });

  it('searches users by query fragment', async () => {
    const { service, userRepository } = buildService();

    const builder = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'user-1' } as User]),
    };

    userRepository.createQueryBuilder.mockReturnValue(builder);

    const searchPromise = service.searchUsers('john');
    const expectation: Promise<void> = expect(searchPromise).resolves.toEqual([
      { id: 'user-1' },
    ]);

    await expectation;

    expect(builder.where).toHaveBeenCalled();
  });
});
