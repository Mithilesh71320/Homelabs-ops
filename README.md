# HomeLab Ops — Self-Hosted MCP Server

HomeLab Ops is a self-hosted Model Context Protocol (MCP) server for Amazon Alexa+.

## Requirements

- Node.js v20+

## Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

## Endpoints

- `GET /health` — Basic uptime health check returning `{"status":"ok"}`.
- `POST /mcp` — MCP Streamable HTTP Transport endpoint per MCP spec 2025-11-25+.

## Tools Available

- `ping` — Checks server status and returns `"HomeLab Ops MCP server is alive."`
