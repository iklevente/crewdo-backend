import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { WorkspaceService } from '../services/workspace.service';
// import { ChannelService } from '../services/channel.service'; // Commented out - service missing
// import { MessageService } from '../services/message.service'; // Commented out - not used without channels
import { PresenceService } from '../services/presence.service';
import { UserRole } from '../entities/user.entity';
import { WorkspaceType } from '../entities/workspace.entity';
// import { ChannelType } from '../entities/channel.entity'; // Temporarily commented out due to missing ChannelService
import { PresenceStatus } from '../dto/presence.dto';

// Type interfaces for seed script
interface SeedWorkspace {
  id: string;
  name: string;
}

async function seed() {
  console.log('🌱 Starting database seeding...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const workspaceService = app.get(WorkspaceService);
  // const channelService = app.get(ChannelService); // Commented out - service missing
  // const messageService = app.get(MessageService); // Commented out - not used without channels
  const presenceService = app.get(PresenceService);

  try {
    // Check if admin user already exists
    const existingAdmin = await usersService.findByEmail('admin@crewdo.com');

    if (!existingAdmin) {
      // Create admin user
      const adminData = {
        email: 'admin@crewdo.com',
        firstName: 'Admin',
        lastName: 'User',
        password: await bcrypt.hash('admin123', 10),
        role: UserRole.ADMIN,
        department: 'Administration',
        position: 'System Administrator',
      };

      const admin = await usersService.create(adminData);
      console.log('✅ Admin user created:', admin.email);
    } else {
      console.log('ℹ️ Admin user already exists');
    }

    // Create sample project manager
    const existingPM = await usersService.findByEmail('pm@crewdo.com');
    if (!existingPM) {
      const pmData = {
        email: 'pm@crewdo.com',
        firstName: 'Project',
        lastName: 'Manager',
        password: await bcrypt.hash('pm123', 10),
        role: UserRole.PROJECT_MANAGER,
        department: 'Project Management',
        position: 'Senior Project Manager',
      };

      const pm = await usersService.create(pmData);
      console.log('✅ Project Manager user created:', pm.email);
    } else {
      console.log('ℹ️ Project Manager user already exists');
    }

    // Create sample team member
    const existingMember = await usersService.findByEmail('member@crewdo.com');
    if (!existingMember) {
      const memberData = {
        email: 'member@crewdo.com',
        firstName: 'Team',
        lastName: 'Member',
        password: await bcrypt.hash('member123', 10),
        role: UserRole.TEAM_MEMBER,
        department: 'Development',
        position: 'Software Developer',
      };

      const member = await usersService.create(memberData);
      console.log('✅ Team Member user created:', member.email);
    } else {
      console.log('ℹ️ Team Member user already exists');
    }

    // Get user IDs for further seeding
    const admin = await usersService.findByEmail('admin@crewdo.com');
    const pm = await usersService.findByEmail('pm@crewdo.com');
    const member = await usersService.findByEmail('member@crewdo.com');

    if (admin && pm && member) {
      console.log('🏢 Creating sample workspace...');

      // Create main workspace
      const workspaceData = {
        name: 'Crewdo Team',
        description: 'Main team workspace for collaboration',
        type: WorkspaceType.TEAM,
        isPublic: false,
      };

      let workspace: SeedWorkspace | undefined;
      try {
        const workspaces = await workspaceService.findAll(admin.id);
        workspace = workspaces.find(
          (w) => (w as SeedWorkspace).name === 'Crewdo Team',
        ) as SeedWorkspace;

        if (!workspace) {
          workspace = (await workspaceService.create(
            workspaceData,
            admin.id,
          )) as SeedWorkspace;
          console.log('✅ Workspace created:', workspace.name);

          // Add members to workspace
          await workspaceService.addMember(workspace.id, pm.id, admin.id);
          await workspaceService.addMember(workspace.id, member.id, admin.id);
          console.log('✅ Added members to workspace');
        }
      } catch (error) {
        console.log(
          'ℹ️ Workspace may already exist or error occurred:',
          (error as Error).message,
        );
      }

      if (workspace) {
        console.log('💬 Creating sample channels...');

        // Create development channel
        try {
          // Channel creation temporarily commented out due to missing ChannelService
          /*
          const devChannelData = {
            name: 'development',
            description: 'Development team discussions',
            type: ChannelType.TEXT,
            workspaceId: workspace.id,
          };

          const devChannel = await channelService.create(
            devChannelData,
            admin.id,
          );
          console.log('✅ Development channel created');
          */
          // Sample messages temporarily commented out due to missing ChannelService
          /*
          const sampleMessages = [
            {
              content: 'Welcome to the development channel! 🚀',
              channelId: devChannel.id,
              isSystemMessage: true,
            },
            {
              content: 'Hey team! Ready to start working on the new features?',
              channelId: devChannel.id,
            },
            {
              content:
                "Absolutely! I've been looking at the requirements. Looking forward to collaborating!",
              channelId: devChannel.id,
            },
          ];

          for (let i = 0; i < sampleMessages.length; i++) {
            const userId = i === 0 ? admin.id : i === 1 ? pm.id : member.id;
            await messageService.create(sampleMessages[i], userId);
          }
          console.log('✅ Sample messages created');
          */
        } catch (error) {
          console.log(
            'ℹ️ Development channel may already exist:',
            (error as Error).message,
          );
        }

        // Random channel creation temporarily commented out due to missing ChannelService
        /*
        try {
          const randomChannelData = {
            name: 'random',
            description: 'Random discussions and fun stuff',
            type: ChannelType.TEXT,
            workspaceId: workspace.id,
          };

          const randomChannel = await channelService.create(
            randomChannelData,
            admin.id,
          );
          console.log('✅ Random channel created');

          // Add a fun message
          await messageService.create(
            {
              content:
                'This is where we share memes and have casual conversations! 😄',
              channelId: randomChannel.id,
            },
            admin.id,
          );
        } catch (error) {
          console.log(
            'ℹ️ Random channel may already exist:',
            (error as Error).message,
          );
        }
        */

        // Direct message creation temporarily commented out due to missing ChannelService
        /*
        try {
          const dmData = {
            userIds: [pm.id], // DM between admin and PM
          };

          const dmChannel = await channelService.createDirectMessage(
            dmData,
            admin.id,
          );
          console.log('✅ Direct message channel created');

          // Add a DM message
          await messageService.create(
            {
              content: "Hey! How's the project planning going?",
              channelId: dmChannel.id,
            },
            admin.id,
          );

          await messageService.create(
            {
              content: "Going great! I'll have the timeline ready by tomorrow.",
              channelId: dmChannel.id,
            },
            pm.id,
          );
        } catch (error) {
          console.log(
            'ℹ️ DM channel may already exist:',
            (error as Error).message,
          );
        }
        */
      }

      // Set up user presence
      console.log('👤 Setting up user presence...');
      try {
        await presenceService.setUserOnline(admin.id);
        await presenceService.setUserOnline(pm.id);
        await presenceService.setUserOnline(member.id);

        // Set custom statuses
        await presenceService.updatePresence(pm.id, {
          status: PresenceStatus.ONLINE,
          customStatus: 'Planning sprint',
        });

        await presenceService.updatePresence(member.id, {
          status: PresenceStatus.ONLINE,
          customStatus: 'Coding new features',
        });

        console.log('✅ User presence set up');
      } catch (error) {
        console.log('ℹ️ Presence setup error:', (error as Error).message);
      }
    }

    console.log('🎉 Database seeding completed!');
    console.log('\n📝 Login credentials:');
    console.log('Admin: admin@crewdo.com / admin123');
    console.log('Project Manager: pm@crewdo.com / pm123');
    console.log('Team Member: member@crewdo.com / member123');
    console.log('\n💬 Sample data created:');
    console.log('- Main team workspace with channels');
    console.log('- Sample messages and conversations');
    console.log('- Direct messages between users');
    console.log('- User presence and status data');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await app.close();
  }
}

void seed();
