import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: (configService.get('cors.origin') as string) || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Crewdo API')
    .setVersion('1.0.0')
    .setContact('Crewdo Team', 'https://crewdo.com', 'support@crewdo.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User authentication and authorization endpoints')
    .addTag('Users', 'User profile and management operations')
    .addTag('Workspaces', 'Workspace creation and management')
    .addTag('Channels', 'Communication channel management')
    .addTag('Messages', 'Real-time messaging operations')
    .addTag('Projects', 'Project management and organization')
    .addTag('Tasks', 'Task creation, assignment, and tracking')
    .addTag('Comments', 'Comments and discussions on tasks/projects')
    .addTag('Calls', 'Voice and video call management')
    .addTag('Media', 'VoIP, screen sharing, and media operations')
    .addTag('Files', 'File upload and management')
    .addServer('/api', 'Production API') // Ensures Swagger UI uses /api as base path
    .addServer('http://localhost:3000/api', 'Development API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  const port = (configService.get('port') as number) || 3000;
  await app.listen(port);

  console.log(`🚀 Crewdo Backend is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}
void bootstrap();
