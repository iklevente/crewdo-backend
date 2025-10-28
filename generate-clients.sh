#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting OpenAPI client generation...${NC}"

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

# Wait for server to start
echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
sleep 5

# Check if server is running
if ! curl -f http://localhost:3000/api/docs-json >/dev/null 2>&1; then
    echo -e "${RED}❌ Server is not responding. Trying to start in dev mode...${NC}"
    kill $SERVER_PID 2>/dev/null
    npm run start:dev &
    SERVER_PID=$!
    sleep 10
fi

# Download the OpenAPI spec
echo -e "${YELLOW}📥 Downloading OpenAPI specification...${NC}"
curl -o openapi.json http://localhost:3000/api/docs-json

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to download OpenAPI spec. Make sure the server is running.${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Stop the server
echo -e "${YELLOW}🛑 Stopping the server...${NC}"
kill $SERVER_PID 2>/dev/null

# Create output directories
mkdir -p generated-clients/typescript-axios

# Generate TypeScript Axios client
echo -e "${YELLOW}🔧 Generating TypeScript Axios client...${NC}"
npx openapi-generator-cli generate \
    -i openapi.json \
    -g typescript-axios \
    -o generated-clients/typescript-axios \
    --config openapi-generator-config.json \
    --additional-properties=withSeparateModelsAndApi=true,apiPackage=api,modelPackage=models

# Create a README for the generated clients
cat > generated-clients/README.md << 'EOF'
# Generated API Clients

This directory contains auto-generated API clients for the Crewdo Backend API.

## Available Clients

### TypeScript Axios Client (`typescript-axios/`)
- **Best for**: React, Vue, Angular, or any TypeScript project
- **Features**: Full TypeScript support, Axios-based HTTP client
- **Usage**: 
  ```typescript
  import { DefaultApi, Configuration } from './typescript-axios';
  
  const config = new Configuration({
    basePath: 'http://localhost:3000/api',
    accessToken: 'your-jwt-token'
  });
  
  const api = new DefaultApi(config);
  ```

## Installation

Copy the generated client folder to your frontend project and install dependencies:

```bash
# For TypeScript Axios client
cd typescript-axios && npm install

# For JavaScript client  
cd javascript && npm install
```

## Authentication

All clients support Bearer token authentication. Set the access token in the configuration:

```typescript
const config = new Configuration({
  basePath: 'http://localhost:3000/api',
  accessToken: 'your-jwt-token'
});
```
EOF

echo -e "${GREEN}✅ Client generation completed successfully!${NC}"
echo -e "${BLUE}📁 Generated clients available in:${NC}"
echo -e "  - ${YELLOW}generated-clients/typescript-axios/${NC} (TypeScript + Axios)"
echo -e "  - ${YELLOW}generated-clients/javascript/${NC} (Plain JavaScript)"  
echo -e "  - ${YELLOW}generated-clients/react-query/${NC} (React Query base)"
echo -e "${BLUE}📖 Check generated-clients/README.md for usage instructions${NC}"

# Clean up
rm -f openapi.json

echo -e "${GREEN}🎉 Done! Your frontend clients are ready to use.${NC}"