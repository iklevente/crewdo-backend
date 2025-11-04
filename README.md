# Crewdo Backend

Production-ready collaboration backend built with NestJS, TypeScript, WebSockets, and MSSQL. It powers authentication, work management, messaging, presence, real-time notifications, and LiveKit powered voice/video for the Crewdo platform.

## Platform Overview

- **Authentication and Identity**: Local email/password auth with JWT access and refresh tokens, role-aware guards, and presence tracking on login.
- **Work Management**: Projects, tasks, comments, and attachments exposed through modular REST controllers with validation and DTOs.
- **Real-time Collaboration**: Socket.IO gateway for chat, presence, and notifications; LiveKit integration for calls and screen sharing.
- **Files and Static Assets**: Multi-tenant attachment storage on disk, served via static middleware with configurable root.
- **API Tooling**: Swagger UI at `/api/docs`, OpenAPI generator scripts, strict TypeScript configuration, linting, and Jest test harness.

## Requirements

- Node.js 20+
- Docker Desktop or Docker Engine
- npm 11+ (bundled with Node 20)
- Optional: DB manager such as DBeaver for MSSQL administration

## Environment Configuration

1. Copy the template environment file and edit it as needed:

   ```bash
   cp .env.dist .env
   ```

2. Review `.env` and ensure the following values reflect your local setup:
   - `PORT` and `BASE_URL` for the API server
   - `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` for MSSQL access
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`, and expiration settings
   - `CORS_ORIGIN` whitelisted frontend origin
   - `UPLOAD_PATH` for local disk attachments
   - `LIVEKIT_*` credentials pointing at your LiveKit instance

All configuration values are consumed through `@nestjs/config` and default to the values defined in `src/config/configuration.ts` when nothing is provided.

## Local Services

### LiveKit (media server)

Run a local LiveKit dev server with Docker:

```bash
docker run -it \
  -p 7880:7880 -p 7881:7881 -p 7882:7882 -p 7883:7883 \
  livekit/livekit-server:master --dev --bind 0.0.0.0
```

Keep this container running while using Crewdo for calls or screen sharing. The default `.env.dist` already references the exposed ports.

### Microsoft SQL Server

Launch a local MSSQL instance and create the application database:

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=yourStrong(!)Password" \
  -p 1434:1433 -d mcr.microsoft.com/mssql/server:2022-latest
```

Once the container is healthy, connect with a DB tool such as DBeaver using:

- Host: `localhost`
- Port: `1434`
- User: `sa`
- Password: `yourStrong(!)Password`

Create the database:

```sql
CREATE DATABASE crewdo_backend;
```

Update `.env` if you change credentials or port mappings.

## Installation and Startup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile TypeScript (optional, on-demand build):

   ```bash
   npm run build
   ```

3. Start the API (defaults to `http://localhost:3000`):

   ```bash
   npm run start
   ```

   Use `npm run start:dev` for watch mode during development.

4. Open Swagger docs at `http://localhost:3000/api/docs` for endpoint exploration.

## Project Structure

- `src/app.module.ts` wires global configuration, database connections, and feature modules.
- `src/config/configuration.ts` centralizes typed configuration defaults consumed by `ConfigService`.
- `src/modules/chat.module.ts` coordinates the WebSocket gateway, LiveKit service, and message-related controllers.
- `src/services/*` holds domain services (attachments, notifications, presence, live calls, etc.).
- `src/controllers/*` exposes REST resources with DTO validation and guards.
- `src/entities/*` and `src/dto/*` define TypeORM models and request/response shapes.
- `src/scripts/` includes ad-hoc scripts like seeders.

## Notable Capabilities

- **Authentication**: Local strategy with bcrypt hashing, refresh tokens, and JWT strategies delegated to `ConfigService` driven secrets.
- **Presence and Messaging**: WebSocket gateway updates online status, broadcasts channel events, and integrates with notification service.
- **Attachments**: Disk-backed storage with configurable root path, per-entity access guards, and signed download URLs.
- **Calls**: LiveKit service wraps the server SDK to provision rooms and generate participant tokens with role-based permissions.
- **Observability**: Structured logging, validation pipes, and consistent error handling across modules.

## Common Tasks

- `npm run lint` – static analysis (ESLint)
- `npm run test` – unit tests with Jest
- `npm run start:prod` – run compiled build from `dist`
- `npm run generate:client` – regenerate TypeScript API clients from live Swagger schema
