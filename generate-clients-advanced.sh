#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}🚀 Crewdo API Client Generator${NC}"
echo -e "${BLUE}=====================================${NC}"

# Check if openapi-generator-cli is installed
if ! command -v openapi-generator-cli &> /dev/null; then
    echo -e "${YELLOW}⚠️  openapi-generator-cli not found globally. Using npx...${NC}"
    GENERATOR_CMD="npx openapi-generator-cli"
else
    GENERATOR_CMD="openapi-generator-cli"
fi

# Function to check if server is running
check_server() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:3000/api/docs-json >/dev/null 2>&1; then
            return 0
        fi
        echo -e "${YELLOW}⏳ Waiting for server... (attempt $attempt/$max_attempts)${NC}"
        sleep 2
        ((attempt++))
    done
    return 1
}

# Build the project first
echo -e "${YELLOW}📦 Building the project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix the errors and try again.${NC}"
    exit 1
fi

# Start the server in the background
echo -e "${YELLOW}🌐 Starting the server...${NC}"
npm run start:prod &
SERVER_PID=$!

# Wait for server to start and check if it's responding
if ! check_server; then
    echo -e "${RED}❌ Server failed to start in production mode. Trying development mode...${NC}"
    kill $SERVER_PID 2>/dev/null
    
    npm run start:dev &
    SERVER_PID=$!
    
    if ! check_server; then
        echo -e "${RED}❌ Server failed to start. Please check your configuration.${NC}"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
fi

echo -e "${GREEN}✅ Server is running and responding${NC}"

# Download the OpenAPI spec
echo -e "${YELLOW}📥 Downloading OpenAPI specification...${NC}"
curl -s -o openapi.json http://localhost:3000/api/docs-json

if [ $? -ne 0 ] || [ ! -s openapi.json ]; then
    echo -e "${RED}❌ Failed to download OpenAPI spec or file is empty${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ OpenAPI spec downloaded successfully${NC}"

# Stop the server
echo -e "${YELLOW}🛑 Stopping the server...${NC}"
kill $SERVER_PID 2>/dev/null
sleep 2

# Create output directories
echo -e "${YELLOW}📁 Creating output directories...${NC}"
rm -rf generated-clients
mkdir -p generated-clients/{typescript-axios,javascript,react-query,fetch}

# Generate TypeScript Axios client
echo -e "${YELLOW}🔧 Generating TypeScript Axios client...${NC}"
$GENERATOR_CMD generate \
    -i openapi.json \
    -g typescript-axios \
    -o generated-clients/typescript-axios \
    --config openapi-generator-config.json \
    --additional-properties=withSeparateModelsAndApi=true,apiPackage=api,modelPackage=models,supportsES6=true,npmName=crewdo-typescript-client,npmVersion=1.0.0

# Generate JavaScript client
echo -e "${YELLOW}🔧 Generating JavaScript client...${NC}"
$GENERATOR_CMD generate \
    -i openapi.json \
    -g javascript \
    -o generated-clients/javascript \
    --config openapi-generator-config.json \
    --additional-properties=usePromises=true,npmName=crewdo-js-client,npmVersion=1.0.0

# Generate TypeScript Fetch client (lighter alternative)
echo -e "${YELLOW}🔧 Generating TypeScript Fetch client...${NC}"
$GENERATOR_CMD generate \
    -i openapi.json \
    -g typescript-fetch \
    -o generated-clients/fetch \
    --config openapi-generator-config.json \
    --additional-properties=withSeparateModelsAndApi=true,apiPackage=api,modelPackage=models,supportsES6=true,npmName=crewdo-fetch-client,npmVersion=1.0.0

# Generate React Query compatible client
echo -e "${YELLOW}🔧 Generating React Query compatible client...${NC}"
$GENERATOR_CMD generate \
    -i openapi.json \
    -g typescript-axios \
    -o generated-clients/react-query \
    --config openapi-generator-config.json \
    --additional-properties=withSeparateModelsAndApi=true,apiPackage=api,modelPackage=models,supportsES6=true,useSingleRequestParameter=true,npmName=crewdo-react-query-client,npmVersion=1.0.0

# Create React Query hooks wrapper
echo -e "${YELLOW}🔧 Creating React Query hooks...${NC}"
cat > generated-clients/react-query/hooks.ts << 'EOF'
// Auto-generated React Query hooks for Crewdo API
import { useMutation, useQuery, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { AxiosError, AxiosResponse } from 'axios';
import * as api from './api';
import { Configuration } from './configuration';

// Create a configured API instance
export const createApiConfig = (baseURL?: string, accessToken?: string) => {
  return new Configuration({
    basePath: baseURL || 'http://localhost:3000/api',
    accessToken,
  });
};

// Query Keys
export const queryKeys = {
  // Authentication
  auth: ['auth'] as const,
  
  // Users
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,
  
  // Workspaces
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspaces', id] as const,
  
  // Projects
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  
  // Tasks
  tasks: ['tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  projectTasks: (projectId: string) => ['projects', projectId, 'tasks'] as const,
  
  // Messages
  messages: ['messages'] as const,
  channelMessages: (channelId: string) => ['channels', channelId, 'messages'] as const,
  
  // Calls
  calls: ['calls'] as const,
  call: (id: string) => ['calls', id] as const,
  
  // Media
  media: ['media'] as const,
  mediaRooms: ['media', 'rooms'] as const,
  mediaRoom: (id: string) => ['media', 'rooms', id] as const,
};

// Example hooks (you can extend these based on your API)
export const useWorkspaces = (
  config: Configuration,
  options?: UseQueryOptions<any[], AxiosError>
) => {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: async () => {
      const apiInstance = new api.DefaultApi(config);
      const response = await apiInstance.workspacesGet();
      return response.data;
    },
    ...options,
  });
};

export const useCreateWorkspace = (
  config: Configuration,
  options?: UseMutationOptions<any, AxiosError, any>
) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (workspaceData: any) => {
      const apiInstance = new api.DefaultApi(config);
      const response = await apiInstance.workspacesPost(workspaceData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
    ...options,
  });
};

// Add more hooks as needed for your specific endpoints
EOF

# Create comprehensive documentation
cat > generated-clients/README.md << 'EOF'
# 🚀 Crewdo API Clients

Auto-generated API clients for the Crewdo Backend API with full TypeScript support.

## 📦 Available Clients

### 1. TypeScript Axios Client (`typescript-axios/`)
**Best for**: React, Vue, Angular, Node.js applications
- ✅ Full TypeScript support
- ✅ Axios-based HTTP client
- ✅ Comprehensive error handling
- ✅ Request/response interceptors

```typescript
import { DefaultApi, Configuration } from './typescript-axios';

const config = new Configuration({
  basePath: 'http://localhost:3000/api',
  accessToken: 'your-jwt-token'
});

const api = new DefaultApi(config);

// Example usage
const workspaces = await api.workspacesGet();
```

### 2. TypeScript Fetch Client (`fetch/`)
**Best for**: Modern browsers, lightweight applications
- ✅ Native Fetch API
- ✅ Smaller bundle size
- ✅ Browser-native
- ✅ TypeScript support

```typescript
import { DefaultApi, Configuration } from './fetch';

const config = new Configuration({
  basePath: 'http://localhost:3000/api',
  accessToken: 'your-jwt-token'
});

const api = new DefaultApi(config);
```

### 3. JavaScript Client (`javascript/`)
**Best for**: Plain JavaScript projects, Node.js without TypeScript
- ✅ ES6+ compatible
- ✅ Promise-based
- ✅ No TypeScript dependency

```javascript
import { DefaultApi } from './javascript';

const api = new DefaultApi();
api.basePath = 'http://localhost:3000/api';
```

### 4. React Query Client (`react-query/`)
**Best for**: React applications with TanStack Query
- ✅ Pre-built React Query hooks
- ✅ Caching and synchronization
- ✅ TypeScript support
- ✅ Optimistic updates

```typescript
import { useWorkspaces, useCreateWorkspace, createApiConfig } from './react-query/hooks';

function WorkspaceList() {
  const config = createApiConfig('http://localhost:3000/api', token);
  const { data: workspaces, isLoading } = useWorkspaces(config);
  const createWorkspaceMutation = useCreateWorkspace(config);
  
  // Your component logic
}
```

## 🛠 Installation

### Option 1: Copy to your project
```bash
# Copy the desired client to your project
cp -r generated-clients/typescript-axios ./src/api

# Install dependencies
npm install axios
```

### Option 2: Use as npm package
```bash
# In the client directory
cd generated-clients/typescript-axios
npm install
npm pack

# In your project
npm install ./path/to/crewdo-typescript-client-1.0.0.tgz
```

## 🔐 Authentication

All clients support JWT Bearer token authentication:

```typescript
// Method 1: Configuration object
const config = new Configuration({
  basePath: 'http://localhost:3000/api',
  accessToken: 'your-jwt-token'
});

// Method 2: Set headers directly (Axios client)
api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

## 📡 Available Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Token refresh
- `POST /auth/logout` - User logout

### Users
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile
- `GET /users` - List users (admin)

### Workspaces
- `GET /workspaces` - List workspaces
- `POST /workspaces` - Create workspace
- `GET /workspaces/{id}` - Get workspace details
- `PUT /workspaces/{id}` - Update workspace
- `DELETE /workspaces/{id}` - Delete workspace

### Projects
- `GET /projects` - List projects
- `POST /projects` - Create project
- `GET /projects/{id}` - Get project details
- `PUT /projects/{id}` - Update project
- `DELETE /projects/{id}` - Delete project

### Tasks
- `GET /tasks` - List tasks
- `POST /tasks` - Create task
- `GET /tasks/{id}` - Get task details
- `PUT /tasks/{id}` - Update task
- `DELETE /tasks/{id}` - Delete task

### Media & VoIP
- `GET /media/webrtc-config` - Get WebRTC configuration
- `POST /media/rooms` - Create media room
- `GET /media/rooms` - List media rooms
- `POST /media/rooms/{id}/join` - Join media room
- `POST /media/rooms/{id}/leave` - Leave media room

### Messages
- `GET /messages` - List messages
- `POST /messages` - Send message
- `GET /messages/{id}` - Get message details

### Calls
- `POST /calls` - Initiate call
- `GET /calls/{id}` - Get call details
- `POST /calls/{id}/join` - Join call
- `POST /calls/{id}/leave` - Leave call

## 🔄 Real-time Features

For real-time features (WebSocket), use the Socket.IO client:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Listen for events
socket.on('message_received', (data) => {
  console.log('New message:', data);
});

// Send events
socket.emit('send_message', {
  channelId: 'channel-id',
  content: 'Hello world!'
});
```

## 🔧 Configuration

### Environment Variables
```bash
# API Base URL
REACT_APP_API_URL=http://localhost:3000/api

# WebSocket URL
REACT_APP_WS_URL=http://localhost:3000
```

### TypeScript Configuration
Ensure your `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true
  }
}
```

## 🐛 Error Handling

```typescript
try {
  const response = await api.workspacesGet();
  console.log(response.data);
} catch (error) {
  if (error.response?.status === 401) {
    // Handle authentication error
    redirectToLogin();
  } else if (error.response?.status === 403) {
    // Handle authorization error
    showAccessDeniedMessage();
  } else {
    // Handle other errors
    console.error('API Error:', error.message);
  }
}
```

## 🚀 Advanced Usage

### Request Interceptors (Axios client)
```typescript
import axios from 'axios';

// Add request interceptor for automatic token injection
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
```

### React Query Integration
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
    </QueryClientProvider>
  );
}
```

## 🔄 Regenerating Clients

After making changes to your API:

```bash
# Regenerate all clients
npm run generate:client

# Or generate specific client type
npx openapi-generator-cli generate -i openapi.json -g typescript-axios -o ./my-client
```

## 📚 Documentation

- [Swagger UI](http://localhost:3000/api/docs) - Interactive API documentation
- [OpenAPI Spec](http://localhost:3000/api/docs-json) - Raw OpenAPI specification
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [React Query Documentation](https://tanstack.com/query/latest)

## 🤝 Contributing

When adding new endpoints:
1. Add proper OpenAPI decorators to your controllers
2. Update the API documentation
3. Regenerate the clients
4. Test the generated code

## 📄 License

MIT License - see LICENSE file for details
EOF

# Create package.json files for each client
echo -e "${YELLOW}📦 Creating package.json files...${NC}"

# TypeScript Axios client package.json
cat > generated-clients/typescript-axios/package.json << 'EOF'
{
  "name": "crewdo-typescript-client",
  "version": "1.0.0",
  "description": "TypeScript Axios client for Crewdo API",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "axios": "^1.12.2"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  },
  "keywords": ["crewdo", "api", "client", "typescript", "axios"],
  "author": "Crewdo Team",
  "license": "MIT"
}
EOF

# React Query client additional files
cat > generated-clients/react-query/package.json << 'EOF'
{
  "name": "crewdo-react-query-client",
  "version": "1.0.0",
  "description": "React Query client for Crewdo API",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "axios": "^1.12.2",
    "@tanstack/react-query": "^5.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/react": "^18.0.0"
  },
  "keywords": ["crewdo", "api", "client", "react", "react-query", "typescript"],
  "author": "Crewdo Team",
  "license": "MIT"
}
EOF

echo -e "${GREEN}✅ Client generation completed successfully!${NC}"
echo -e "${BLUE}📁 Generated clients:${NC}"
echo -e "  📱 ${YELLOW}typescript-axios/${NC} - Full-featured TypeScript client"
echo -e "  🌐 ${YELLOW}fetch/${NC} - Lightweight TypeScript Fetch client"  
echo -e "  📜 ${YELLOW}javascript/${NC} - Plain JavaScript client"
echo -e "  ⚛️  ${YELLOW}react-query/${NC} - React Query integration"
echo -e "${BLUE}📖 Documentation: ${YELLOW}generated-clients/README.md${NC}"
echo -e "${BLUE}🔗 API Docs: ${YELLOW}http://localhost:3000/api/docs${NC}"

# Clean up
rm -f openapi.json

echo -e "${PURPLE}🎉 Ready to use in your frontend applications!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Copy your preferred client to your frontend project"
echo -e "  2. Install dependencies (axios, @tanstack/react-query, etc.)"
echo -e "  3. Configure base URL and authentication"
echo -e "  4. Start building awesome features! 🚀"