<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# Crewdo Backend

A comprehensive team collaboration and project management API built with NestJS, TypeScript, and PostgreSQL.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control
- 👥 **User Management** - Complete user CRUD with roles (Admin, Project Manager, Team Member, Client)
- 📋 **Project Management** - Create, manage, and collaborate on projects
- ✅ **Task Management** - Full task lifecycle with assignments, priorities, and status tracking
- 💬 **Comments System** - Task-based commenting and collaboration
- 📁 **File Attachments** - Upload and manage project/task files
- 🔔 **Notifications** - Real-time notification system
- 📊 **Rich API Documentation** - Auto-generated Swagger/OpenAPI docs
- 🛡️ **Security** - Input validation, CORS, and secure authentication
- 🏗️ **Type Safety** - Full TypeScript implementation with strict typing

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: Microsoft SQL Server with TypeORM
- **Authentication**: JWT with Passport
- **Documentation**: Swagger/OpenAPI
- **Validation**: class-validator
- **File Upload**: Multer
- **Environment**: dotenv

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- Microsoft SQL Server (accessible at localhost:1434)
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd crewdo-backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and other configuration
   ```

4. **Ensure your MSSQL database exists**

   ```sql
   -- Connect to your MSSQL server and create the database if it doesn't exist
   CREATE DATABASE crewdo_backend;
   ```

5. **Run database migrations and seed data**

   ```bash
   npm run seed
   ```

6. **Start the development server**
   ```bash
   npm run start:dev
   ```

The API will be available at `http://localhost:3000/api`

## API Documentation

Once the server is running, visit `http://localhost:3000/api/docs` for interactive API documentation.

## Default Users

After running the seed script, you can log in with these default accounts:

- **Admin**: `admin@crewdo.com` / `admin123`
- **Project Manager**: `pm@crewdo.com` / `pm123`
- **Team Member**: `member@crewdo.com` / `member123`

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/profile` - Get current user profile

### Users

- `GET /api/users` - Get all users
- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update current user profile
- `PATCH /api/users/me/password` - Change password
- `GET /api/users/search` - Search users
- `GET /api/users/:id` - Get user by ID
- `PATCH /api/users/:id` - Update user (Admin only)
- `DELETE /api/users/:id` - Delete user (Admin only)

### Projects

- `POST /api/projects` - Create project
- `GET /api/projects` - Get accessible projects
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `PATCH /api/projects/:id/members` - Add project members
- `DELETE /api/projects/:id/members/:memberId` - Remove project member

### Tasks

- `POST /api/tasks` - Create task
- `GET /api/tasks` - Get accessible tasks
- `GET /api/tasks/my-tasks` - Get user's assigned/created tasks
- `GET /api/tasks/:id` - Get task details
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PATCH /api/tasks/:id/position` - Update task position

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=crewdo

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=1d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
JWT_REFRESH_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3001
```

## Scripts

```bash
# Development
npm run start:dev        # Start with hot reload
npm run start:debug      # Start in debug mode

# Production
npm run build           # Build the project
npm run start:prod      # Start production server

# Database
npm run seed           # Seed database with initial data

# Testing
npm run test           # Run unit tests
npm run test:e2e       # Run e2e tests
npm run test:cov       # Run tests with coverage

# Code Quality
npm run lint           # Run ESLint
npm run format         # Format code with Prettier
```

## Database Schema

The application uses the following main entities:

- **User** - User accounts with roles and profiles
- **Project** - Projects with owners and members
- **Task** - Tasks within projects with assignments and tracking
- **Comment** - Comments on tasks for collaboration
- **Notification** - System notifications for users
- **Attachment** - File attachments for projects and tasks

## Security Features

- JWT token-based authentication
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Input validation and sanitization
- CORS protection
- SQL injection prevention with TypeORM
- Rate limiting ready (can be added)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Development Tips

1. **API Testing**: Use the Swagger UI at `/api/docs` for testing endpoints
2. **Database**: Use TypeORM CLI for migrations and schema changes
3. **Validation**: All DTOs include validation - check the DTO files for requirements
4. **Authentication**: Include `Authorization: Bearer <token>` header for protected routes
5. **Errors**: The API returns consistent error responses with appropriate HTTP status codes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
