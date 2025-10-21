import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  User,
  Project,
  Task,
  Comment,
  Notification,
  Attachment,
  Workspace,
  Channel,
  Message,
  MessageReaction,
  MessageReadReceipt,
  Call,
  CallParticipant,
  UserPresence,
} from '../entities';

export const databaseProviders = [
  {
    provide: 'DATA_SOURCE',
    useFactory: async (configService: ConfigService) => {
      const dataSource = new DataSource({
        type: 'mssql',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [
          User,
          Project,
          Task,
          Comment,
          Notification,
          Attachment,
          Workspace,
          Channel,
          Message,
          MessageReaction,
          MessageReadReceipt,
          Call,
          CallParticipant,
          UserPresence,
        ],
        synchronize: true,
        logging: process.env.NODE_ENV === 'development',
        options: {
          encrypt: false, // Set to true if using Azure SQL
          trustServerCertificate: true, // For local development
        },
      });

      return dataSource.initialize();
    },
    inject: [ConfigService],
  },
];
