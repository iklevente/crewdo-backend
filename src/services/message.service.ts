import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import {
  Message,
  User,
  Channel,
  MessageReaction,
  MessageType,
  Attachment,
  AttachmentType,
} from '../entities/index';
import {
  CreateMessageDto,
  UpdateMessageDto,
  MessageReactionDto,
  MessageResponseDto,
  MessageSearchDto,
  MessageHistoryDto,
} from '../dto/message.dto';
import { AttachmentService } from './attachment.service';

@Injectable()
export class MessageService {
  private messageRepository: Repository<Message>;
  private userRepository: Repository<User>;
  private channelRepository: Repository<Channel>;
  private messageReactionRepository: Repository<MessageReaction>;
  private attachmentRepository: Repository<Attachment>;

  constructor(
    @Inject('DATA_SOURCE')
    private dataSource: DataSource,
    private readonly attachmentService: AttachmentService,
  ) {
    this.messageRepository = this.dataSource.getRepository(Message);
    this.userRepository = this.dataSource.getRepository(User);
    this.channelRepository = this.dataSource.getRepository(Channel);
    this.messageReactionRepository =
      this.dataSource.getRepository(MessageReaction);
    this.attachmentRepository = this.dataSource.getRepository(Attachment);
  }

  async create(
    createMessageDto: CreateMessageDto,
    authorId: string,
  ): Promise<MessageResponseDto> {
    const author = await this.userRepository.findOne({
      where: { id: authorId },
    });
    if (!author) {
      throw new NotFoundException('Author not found');
    }

    const channel = await this.channelRepository.findOne({
      where: { id: createMessageDto.channelId },
      relations: ['members', 'workspace'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user is member of channel
    const isMember = channel.members.some((member) => member.id === authorId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    // Handle parent message (for threads)
    let replyToMessage: Message | null = null;
    if (createMessageDto.parentMessageId) {
      replyToMessage = await this.messageRepository.findOne({
        where: { id: createMessageDto.parentMessageId },
        relations: ['channel'],
      });

      if (
        !replyToMessage ||
        replyToMessage.channel.id !== createMessageDto.channelId
      ) {
        throw new BadRequestException('Invalid parent message');
      }
    }

    // Handle mentioned users - store as array of IDs
    let mentions: string[] = [];
    if (createMessageDto.mentionedUserIds) {
      const mentionedUsers = await this.userRepository.findByIds(
        createMessageDto.mentionedUserIds,
      );

      // Verify mentioned users are channel members
      for (const user of mentionedUsers) {
        const isMentionedUserMember = channel.members.some(
          (member) => member.id === user.id,
        );
        if (!isMentionedUserMember) {
          throw new BadRequestException(
            `User ${user.email} is not a member of this channel`,
          );
        }
      }

      mentions = createMessageDto.mentionedUserIds;
    }

    const message = this.messageRepository.create({
      content: createMessageDto.content,
      type: createMessageDto.isSystemMessage
        ? MessageType.SYSTEM
        : MessageType.TEXT,
      author,
      channel,
      replyTo: replyToMessage || undefined,
      mentions: JSON.stringify(mentions),
      metadata: createMessageDto.embedData
        ? JSON.stringify(createMessageDto.embedData)
        : undefined,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Handle attachments if provided
    if (
      createMessageDto.attachmentIds &&
      createMessageDto.attachmentIds.length > 0
    ) {
      for (const attachmentId of createMessageDto.attachmentIds) {
        try {
          // Verify attachment exists and user has access
          await this.attachmentService.findById(attachmentId, authorId);

          // Associate attachment with message
          await this.attachmentRepository.update(attachmentId, {
            messageId: savedMessage.id,
          });
        } catch (error) {
          // Log error but don't fail message creation
          console.warn(
            `Failed to attach file ${attachmentId} to message ${savedMessage.id}:`,
            (error as Error).message,
          );
        }
      }
    }

    // Update channel's updated timestamp
    channel.updatedAt = new Date();
    await this.channelRepository.save(channel);

    // Reload message with attachments
    const messageWithAttachments = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['author', 'channel', 'attachments'],
    });

    return this.formatMessageResponse(
      messageWithAttachments || savedMessage,
      authorId,
    );
  }

  async findByChannel(
    channelId: string,
    userId: string,
    historyDto?: MessageHistoryDto,
  ): Promise<{
    messages: MessageResponseDto[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check access
    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    const limit = historyDto?.limit || 50;
    const order = historyDto?.order || 'desc';

    let queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.author', 'author')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.replyTo', 'replyTo')
      .leftJoinAndSelect('replyTo.author', 'replyToAuthor')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reactions', 'reactions')
      .leftJoinAndSelect('reactions.user', 'reactionUser')
      .where('message.channelId = :channelId', { channelId })
      .andWhere('message.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('message.createdAt', order === 'desc' ? 'DESC' : 'ASC')
      .take(limit + 1); // Take one extra to check if there are more

    // Handle cursor-based pagination
    if (historyDto?.cursor) {
      const cursorMessage = await this.messageRepository.findOne({
        where: { id: historyDto.cursor },
      });

      if (cursorMessage) {
        if (order === 'desc') {
          queryBuilder = queryBuilder.andWhere('message.createdAt < :cursor', {
            cursor: cursorMessage.createdAt,
          });
        } else {
          queryBuilder = queryBuilder.andWhere('message.createdAt > :cursor', {
            cursor: cursorMessage.createdAt,
          });
        }
      }
    }

    const messages = await queryBuilder.getMany();
    const hasMore = messages.length > limit;

    if (hasMore) {
      messages.pop(); // Remove the extra message
    }

    const nextCursor =
      hasMore && messages.length > 0
        ? messages[messages.length - 1].id
        : undefined;

    return {
      messages: messages.map((message) =>
        this.formatMessageResponse(message, userId),
      ),
      hasMore,
      nextCursor,
    };
  }

  async findThreadReplies(
    parentMessageId: string,
    userId: string,
  ): Promise<MessageResponseDto[]> {
    const parentMessage = await this.messageRepository.findOne({
      where: { id: parentMessageId },
      relations: ['channel', 'channel.members'],
    });

    if (!parentMessage) {
      throw new NotFoundException('Parent message not found');
    }

    // Check access
    const isMember = parentMessage.channel.members.some(
      (member) => member.id === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    const replies = await this.messageRepository.find({
      where: {
        replyTo: { id: parentMessageId },
        isDeleted: false,
      },
      relations: [
        'author',
        'channel',
        'attachments',
        'reactions',
        'reactions.user',
      ],
      order: { createdAt: 'ASC' },
    });

    return replies.map((reply) => this.formatMessageResponse(reply, userId));
  }

  async update(
    id: string,
    updateMessageDto: UpdateMessageDto,
    userId: string,
  ): Promise<MessageResponseDto> {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ['author', 'channel', 'channel.members'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Only author can edit message
    if (message.author.id !== userId) {
      throw new ForbiddenException('Only message author can edit message');
    }

    // Check if edit window is still open (e.g., 24 hours)
    const editWindowHours = 24;
    const editDeadline = new Date(
      message.createdAt.getTime() + editWindowHours * 60 * 60 * 1000,
    );

    if (new Date() > editDeadline) {
      throw new ForbiddenException('Edit window has expired');
    }

    // Handle mentioned users update
    if (updateMessageDto.mentionedUserIds) {
      const mentionedUsers = await this.userRepository.findByIds(
        updateMessageDto.mentionedUserIds,
      );

      // Verify mentioned users are channel members
      for (const user of mentionedUsers) {
        const isMentionedUserMember = message.channel.members.some(
          (member) => member.id === user.id,
        );
        if (!isMentionedUserMember) {
          throw new BadRequestException(
            `User ${user.email} is not a member of this channel`,
          );
        }
      }

      message.mentions = JSON.stringify(updateMessageDto.mentionedUserIds);
    }

    if (updateMessageDto.content) {
      message.content = updateMessageDto.content;
      message.isEdited = true;
    }

    if (typeof updateMessageDto.isPinned === 'boolean') {
      message.isPinned = updateMessageDto.isPinned;
    }

    const updatedMessage = await this.messageRepository.save(message);
    return this.formatMessageResponse(updatedMessage, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ['author', 'channel', 'channel.members', 'channel.creator'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Only author or channel creator can delete message
    const canDelete =
      message.author.id === userId || message.channel.creator?.id === userId;

    if (!canDelete) {
      throw new ForbiddenException(
        'Only message author or channel creator can delete message',
      );
    }

    // Soft delete - mark as deleted but keep record
    message.isDeleted = true;
    message.content = '[This message was deleted]';
    await this.messageRepository.save(message);
  }

  async addReaction(
    messageReactionDto: MessageReactionDto,
    userId: string,
  ): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id: messageReactionDto.messageId },
      relations: ['channel', 'channel.members', 'reactions', 'reactions.user'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check access
    const isMember = message.channel.members.some(
      (member) => member.id === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      (reaction) =>
        reaction.emoji === messageReactionDto.emoji &&
        reaction.user.id === userId,
    );

    if (existingReaction) {
      // Remove reaction (toggle)
      await this.messageReactionRepository.remove(existingReaction);
    } else {
      // Add reaction
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const reaction = this.messageReactionRepository.create({
        emoji: messageReactionDto.emoji,
        user,
        message,
      });
      await this.messageReactionRepository.save(reaction);
    }
  }

  async search(
    searchDto: MessageSearchDto,
    userId: string,
  ): Promise<MessageResponseDto[]> {
    // First, get channels the user has access to
    const userChannels = await this.dataSource
      .getRepository(Channel)
      .createQueryBuilder('channel')
      .leftJoin('channel.members', 'members')
      .where('members.id = :userId', { userId })
      .select(['channel.id'])
      .getMany();

    const channelIds = userChannels.map((ch) => ch.id);

    if (channelIds.length === 0) {
      return []; // User has no channels, return empty
    }

    // Build the message query with simpler joins
    let queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.author', 'author')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .where('message.channelId IN (:...channelIds)', { channelIds })
      .andWhere('message.isDeleted = :isDeleted', { isDeleted: false });

    if (searchDto.query) {
      queryBuilder = queryBuilder.andWhere(
        'UPPER(CAST(message.content AS NVARCHAR(MAX))) LIKE UPPER(:query)',
        {
          query: `%${searchDto.query}%`,
        },
      );
    }

    if (searchDto.channelId) {
      queryBuilder = queryBuilder.andWhere('message.channelId = :channelId', {
        channelId: searchDto.channelId,
      });
    }

    if (searchDto.authorId) {
      queryBuilder = queryBuilder.andWhere('message.authorId = :authorId', {
        authorId: searchDto.authorId,
      });
    }

    if (searchDto.hasAttachments) {
      queryBuilder = queryBuilder.andWhere('attachments.id IS NOT NULL');
    }

    if (searchDto.isPinned) {
      queryBuilder = queryBuilder.andWhere('message.isPinned = :isPinned', {
        isPinned: searchDto.isPinned,
      });
    }

    if (searchDto.fromDate || searchDto.toDate) {
      const fromDate = searchDto.fromDate
        ? new Date(searchDto.fromDate)
        : new Date('1970-01-01');
      const toDate = searchDto.toDate ? new Date(searchDto.toDate) : new Date();

      queryBuilder = queryBuilder.andWhere(
        'message.createdAt BETWEEN :fromDate AND :toDate',
        {
          fromDate,
          toDate,
        },
      );
    }

    const messages = await queryBuilder
      .orderBy('message.createdAt', 'DESC')
      .take(100) // Limit search results
      .getMany();

    return messages.map((message) =>
      this.formatMessageResponse(message, userId),
    );
  }

  async findOne(id: string, userId: string): Promise<MessageResponseDto> {
    const message = await this.messageRepository.findOne({
      where: { id: id, isDeleted: false },
      relations: [
        'author',
        'channel',
        'channel.members',
        'replyTo',
        'replyTo.author',
        'attachments',
        'reactions',
        'reactions.user',
      ],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user has access to the channel
    const isMember = message.channel.members.some(
      (member) => member.id === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied to this message');
    }

    return this.formatMessageResponse(message, userId);
  }

  async getPinnedMessages(
    channelId: string,
    userId: string,
  ): Promise<MessageResponseDto[]> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check access
    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    const pinnedMessages = await this.messageRepository.find({
      where: {
        channelId,
        isPinned: true,
        isDeleted: false,
      },
      relations: [
        'author',
        'channel',
        'attachments',
        'reactions',
        'reactions.user',
      ],
      order: { createdAt: 'DESC' },
    });

    return pinnedMessages.map((message) =>
      this.formatMessageResponse(message, userId),
    );
  }

  async uploadMessageAttachments(
    files: Express.Multer.File[],
    channelId: string,
    userId: string,
  ): Promise<{ attachmentIds: string[] }> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
      relations: ['members'],
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check if user is member of channel
    const isMember = channel.members.some((member) => member.id === userId);
    if (!isMember) {
      throw new ForbiddenException('Access denied to this channel');
    }

    const attachmentIds: string[] = [];
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    for (const file of files) {
      try {
        // Create attachment directly for messages
        const fileName = `${Date.now()}-${file.originalname}`;
        const attachment = this.attachmentRepository.create({
          originalName: file.originalname,
          fileName: fileName,
          filePath: `uploads/messages/${fileName}`,
          mimeType: file.mimetype,
          fileSize: file.size,
          type: this.getAttachmentType(file.mimetype),
          uploadedById: user.id,
          // messageId will be set when message is created
        });

        // Save file to filesystem
        const fs = await import('fs');
        const path = await import('path');
        const uploadDir = path.join(process.cwd(), 'uploads', 'messages');

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        const savedAttachment =
          await this.attachmentRepository.save(attachment);
        attachmentIds.push(savedAttachment.id);
      } catch (error) {
        console.error(`Failed to upload file ${file.originalname}:`, error);
        // Continue with other files
      }
    }

    return { attachmentIds };
  }

  private getAttachmentType(mimeType: string): AttachmentType {
    if (mimeType.startsWith('image/')) return AttachmentType.IMAGE;
    if (mimeType.startsWith('video/')) return AttachmentType.VIDEO;
    if (mimeType.startsWith('audio/')) return AttachmentType.AUDIO;
    if (mimeType === 'application/pdf') return AttachmentType.DOCUMENT;
    if (mimeType.includes('text/') || mimeType.includes('document'))
      return AttachmentType.DOCUMENT;
    return AttachmentType.OTHER;
  }

  private formatMessageResponse(
    message: Message,
    currentUserId: string,
  ): MessageResponseDto {
    // Group reactions by emoji
    interface ReactionGroup {
      id: string;
      emoji: string;
      count: number;
      users: { id: string; firstName: string; lastName: string }[];
      userReacted: boolean;
    }

    const reactionGroups: ReactionGroup[] =
      message.reactions?.reduce((groups: ReactionGroup[], reaction) => {
        const existing = groups.find((g) => g.emoji === reaction.emoji);
        if (existing) {
          existing.count++;
          existing.users.push({
            id: reaction.user.id,
            firstName: reaction.user.firstName,
            lastName: reaction.user.lastName,
          });
          if (reaction.user.id === currentUserId) {
            existing.userReacted = true;
          }
        } else {
          groups.push({
            id: reaction.id,
            emoji: reaction.emoji,
            count: 1,
            users: [
              {
                id: reaction.user.id,
                firstName: reaction.user.firstName,
                lastName: reaction.user.lastName,
              },
            ],
            userReacted: reaction.user.id === currentUserId,
          });
        }
        return groups;
      }, []) || [];

    return {
      id: message.id,
      content: message.content,
      isEdited: message.isEdited,
      isPinned: message.isPinned,
      isDeleted: message.isDeleted,
      isSystemMessage: message.type === MessageType.SYSTEM,
      embedData: message.metadata
        ? (JSON.parse(message.metadata) as unknown)
        : undefined,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.updatedAt, // Use updatedAt as editedAt approximation
      author: {
        id: message.author.id,
        firstName: message.author.firstName,
        lastName: message.author.lastName,
        email: message.author.email,
      },
      channel: {
        id: message.channel.id,
        name: message.channel.name,
        type: message.channel.type,
      },
      parentMessage: message.replyTo
        ? {
            id: message.replyTo.id,
            content: message.replyTo.content,
            author: {
              id: message.replyTo.author.id,
              firstName: message.replyTo.author.firstName,
              lastName: message.replyTo.author.lastName,
            },
          }
        : undefined,
      attachments:
        message.attachments?.map((attachment) => ({
          id: attachment.id,
          filename: attachment.fileName,
          url: attachment.filePath, // You might want to generate a proper URL
          size: attachment.fileSize,
          mimeType: attachment.mimeType,
        })) || [],
      reactions: reactionGroups,
      mentionedUsers: [], // TODO: Load mentioned users by IDs from JSON.parse(message.mentions)
      threadReplies: [], // TODO: Load thread replies if needed
      threadCount: 0, // TODO: Count thread replies
    };
  }
}
