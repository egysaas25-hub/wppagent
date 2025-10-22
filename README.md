# WPPConnect WhatsApp Agent System 📞

![WPPConnect Banner](./img/wppconnect-banner.jpeg)

[![npm version](https://img.shields.io/npm/v/@wppconnect-team/wppconnect.svg?color=green)](https://www.npmjs.com/package/@wppconnect-team/wppconnect)
[![Downloads](https://img.shields.io/npm/dm/@wppconnect-team/wppconnect.svg)](https://www.npmjs.com/package/@wppconnect-team/wppconnect)
[![Build Status](https://img.shields.io/github/actions/workflow/status/wppconnect-team/wppconnect/build.yml?branch=master)](https://github.com/wppconnect-team/wppconnect/actions)
[![Lint Status](https://img.shields.io/github/actions/workflow/status/wppconnect-team/wppconnect/lint.yml?branch=master&label=lint)](https://github.com/wppconnect-team/wppconnect/actions)

> A comprehensive, enterprise-grade WhatsApp Web API system built with TypeScript, featuring multi-tenancy, real-time WebSocket communication, advanced analytics, automated backups, and extensive monitoring capabilities.

<p align="center">
  <a target="_blank" href="#-quick-start">Quick Start</a> •
  <a target="_blank" href="#-features">Features</a> •
  <a target="_blank" href="./ARCHITECTURE.md">Architecture</a> •
  <a target="_blank" href="./API_DOCUMENTATION.md">API Docs</a> •
  <a target="_blank" href="./TESTING.md">Testing</a> •
  <a target="_blank" href="./DEPLOYMENT.md">Deployment</a>
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Documentation](#-documentation)
- [Development](#-development)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

WPPConnect is a production-ready WhatsApp Web API system that allows you to:

- 🤖 **Automate WhatsApp interactions** - Send and receive messages, media, contacts, and more
- 🏢 **Multi-tenant architecture** - Manage multiple organizations with isolated data
- 📊 **Real-time analytics** - Track messages, sessions, and user activity
- 🔄 **WebSocket support** - Real-time communication with presence tracking
- 💾 **Automated backups** - Scheduled and manual database backups
- 📈 **Health monitoring** - Kubernetes-ready liveness and readiness probes
- 🔐 **Enterprise security** - JWT authentication, role-based access control
- 🐳 **Docker ready** - Full containerization with docker-compose

---

## ✨ Features

### WhatsApp Capabilities

|                                                            |     |
| ---------------------------------------------------------- | --- |
| Automatic QR Refresh                                       | ✔   |
| Send **text, image, video, audio and docs**                | ✔   |
| Get **contacts, chats, groups, group members, Block List** | ✔   |
| Send contacts & stickers (including GIF)                   | ✔   |
| Multiple Sessions                                          | ✔   |
| Forward Messages                                           | ✔   |
| Receive messages with webhook support                      | ✔   |
| Send location & live location                              | ✔   |
| Create and manage groups                                   | ✔   |
| Business profile & catalog support                         | ✔   |
| Newsletter management                                      | ✔   |

### System Features

- **Multi-Tenancy**: Complete tenant isolation with per-tenant quotas and settings
- **Real-time Communication**: WebSocket support with presence tracking and typing indicators
- **Analytics Dashboard**: Comprehensive metrics including message trends, session activity, and user engagement
- **Backup & Recovery**: Automated daily backups with restore functionality
- **Health Monitoring**: Detailed health checks for database, memory, CPU, and sessions
- **Rate Limiting**: Token bucket algorithm with configurable limits per tenant
- **Circuit Breaker**: Automatic service degradation for failing operations
- **Memory Management**: Leak detection and automatic cleanup
- **Graceful Shutdown**: Proper connection cleanup and data persistence
- **Comprehensive Logging**: Structured JSON logging with rotation
- **Retry Mechanisms**: Exponential backoff for database and network operations

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- SQLite 3.x (or PostgreSQL for production)
- npm or yarn
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/wppconnect-team/wppconnect.git
cd wppconnect

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_PATH=./data/whatsapp.db

# Security
JWT_SECRET=your-super-secret-key-min-32-characters
ENCRYPTION_KEY=your-64-character-hex-encryption-key

# Session Storage
SESSION_SECRET=your-session-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Health Monitoring
HEALTH_CHECK_INTERVAL=30000
MEMORY_THRESHOLD_PERCENT=80
CPU_THRESHOLD_PERCENT=80

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
```

### Running the Application

```bash
# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start

# With PM2
pm2 start ecosystem.config.js

# With Docker
docker-compose up -d
```

### First API Call

```bash
# Create a session
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "my-session"}'

# Get QR Code
curl http://localhost:3000/api/v1/sessions/my-session/qr

# Send a message
curl -X POST http://localhost:3000/api/v1/sessions/my-session/messages \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "Hello from WPPConnect!"
  }'
```

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Web Browser  │  │ Mobile App   │  │ Third Party  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express Server (REST + WebSocket)                       │   │
│  │  - Authentication (JWT)                                  │   │
│  │  - Rate Limiting                                         │   │
│  │  - Request Validation                                    │   │
│  │  - Error Handling                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Session   │  │  Analytics  │  │   Backup    │             │
│  │   Manager   │  │   Service   │  │   Service   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  WebSocket  │  │   Health    │  │   Tenant    │             │
│  │   Service   │  │   Monitor   │  │   Manager   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                      Data Access Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Models    │  │   Queries   │  │  Migration  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  SQLite DB  │  │  File Store │  │   Cache     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                     WhatsApp Web Layer                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Puppeteer + WhatsApp Web Interface                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

---

## 📚 Documentation

### Core Documentation

- [**Architecture**](./ARCHITECTURE.md) - System design and component interactions
- [**API Documentation**](./API_DOCUMENTATION.md) - Complete API reference with examples
- [**Database Schema**](./DATABASE_SCHEMA.md) - Database structure and relationships
- [**Development Guide**](./DEVELOPMENT.md) - Local development setup and guidelines
- [**Deployment Guide**](./DEPLOYMENT.md) - Production deployment instructions
- [**Testing Guide**](./TESTING.md) - Testing strategy and running tests

### Feature Documentation

- [**System Reliability**](./SYSTEM_RELIABILITY.md) - Error handling, retries, and monitoring
- [**Advanced Features**](./ADVANCED_FEATURES.md) - Multi-tenancy, analytics, and backups
- [**Contributing**](./CONTRIBUTING.md) - How to contribute to the project

### API Documentation

The API is organized into the following modules:

- **Auth** - User authentication and authorization
- **Sessions** - WhatsApp session management
- **Messages** - Send and receive messages
- **Contacts** - Contact management
- **Groups** - Group operations
- **Media** - Media file handling
- **Tenants** - Multi-tenancy management
- **Analytics** - Metrics and reporting
- **Backups** - Backup and restore operations
- **Health** - System health monitoring

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

---

## 🛠️ Development

### Prerequisites

```bash
# Install Node.js 18+ and npm
node --version  # v18.0.0 or higher
npm --version   # 8.0.0 or higher
```

### Setup

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start development server
npm run dev

# Run in watch mode (auto-restart on changes)
npm run dev:watch
```

### Project Structure

```
wppconnect/
├── src/
│   ├── api/              # WhatsApp Web API integration
│   │   ├── helpers/      # Helper functions
│   │   ├── layers/       # API method layers
│   │   └── model/        # Data models
│   ├── config/           # Configuration files
│   │   ├── database.ts   # Database configuration
│   │   ├── environment.ts # Environment variables
│   │   └── migrations.ts # Database migrations
│   ├── controllers/      # HTTP request controllers
│   ├── middleware/       # Express middleware
│   │   ├── auth.middleware.ts
│   │   ├── errorHandler.middleware.ts
│   │   ├── rateLimiter.middleware.ts
│   │   ├── tenant.middleware.ts
│   │   └── validators.middleware.ts
│   ├── models/           # Data models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   │   ├── analytics.service.ts
│   │   ├── backup.service.ts
│   │   ├── health.service.ts
│   │   ├── presence.service.ts
│   │   └── websocket.service.ts
│   ├── tests/            # Test files
│   │   ├── unit/         # Unit tests
│   │   ├── integration/  # Integration tests
│   │   └── helpers/      # Test utilities
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   │   ├── database.utils.ts
│   │   ├── memory.utils.ts
│   │   └── retry.utils.ts
│   ├── app.ts            # Express app configuration
│   ├── server.ts         # HTTP server entry point
│   └── index.ts          # Main entry point
├── .github/
│   └── workflows/        # CI/CD workflows
├── docs/                 # Additional documentation
├── examples/             # Example code
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile            # Docker image definition
├── ecosystem.config.js   # PM2 configuration
└── package.json          # Project dependencies
```

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run dev:watch        # Start with auto-reload

# Building
npm run build            # Build for production
npm run build:client     # Build TypeScript
npm run build:wapi       # Build WhatsApp Web API

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking

# Testing
npm test                 # Run all tests with coverage
npm run test:unit        # Run unit tests
npm run test:integration # Run integration tests
npm run test:watch       # Run tests in watch mode
npm run test:ci          # Run tests in CI mode

# Production
npm start                # Start production server
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development guide.

---

## 🧪 Testing

The project has comprehensive test coverage with unit, integration, and e2e tests.

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Test Coverage

Current coverage thresholds:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

### Test Structure

```
src/tests/
├── unit/                    # Unit tests
│   ├── models/              # Model tests
│   ├── services/            # Service tests
│   └── utils/               # Utility tests
├── integration/             # Integration tests
│   ├── routes/              # API route tests
│   └── websocket.test.ts    # WebSocket tests
├── helpers/                 # Test utilities
│   ├── test-database.ts     # Database helpers
│   └── test-server.ts       # Server helpers
└── setup.ts                 # Global test configuration
```

See [TESTING.md](./TESTING.md) for comprehensive testing guide.

---

## 🚀 Deployment

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

```bash
# Build the project
npm run build

# Set environment variables
export NODE_ENV=production
export PORT=3000
export DB_PATH=/var/lib/wppconnect/whatsapp.db
export JWT_SECRET=your-secret-key

# Start with PM2
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit
```

### Kubernetes Deployment

```yaml
# See deployment/kubernetes/ for full manifests
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wppconnect
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: wppconnect
        image: wppconnect:latest
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /api/v1/health/live
            port: 3000
        readinessProbe:
          httpGet:
            path: /api/v1/health/ready
            port: 3000
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment guide.

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | HTTP server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `DB_PATH` | SQLite database path | `./data/whatsapp.db` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | - |
| `JWT_EXPIRES_IN` | JWT expiration time | `7d` |
| `ENCRYPTION_KEY` | Data encryption key (64 hex chars) | - |
| `SESSION_SECRET` | Session secret key | - |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `HEALTH_CHECK_INTERVAL` | Health check interval (ms) | `30000` |
| `MEMORY_THRESHOLD_PERCENT` | Memory threshold | `80` |
| `CPU_THRESHOLD_PERCENT` | CPU threshold | `80` |
| `BACKUP_ENABLED` | Enable automated backups | `true` |
| `BACKUP_SCHEDULE` | Backup cron schedule | `0 2 * * *` |
| `BACKUP_RETENTION_DAYS` | Backup retention period | `30` |

### Security Recommendations

1. **JWT_SECRET**: Use a strong, random 32+ character string
2. **ENCRYPTION_KEY**: Generate a 64-character hex key: `openssl rand -hex 32`
3. **Database**: Use file permissions to protect database file
4. **HTTPS**: Always use HTTPS in production (nginx/traefik reverse proxy)
5. **Rate Limiting**: Adjust based on your traffic patterns
6. **CORS**: Configure allowed origins in production

---

## 📊 Monitoring

### Health Endpoints

```bash
# Basic health check
curl http://localhost:3000/api/v1/health

# Detailed health with metrics
curl http://localhost:3000/api/v1/health/detailed

# Kubernetes liveness probe
curl http://localhost:3000/api/v1/health/live

# Kubernetes readiness probe
curl http://localhost:3000/api/v1/health/ready
```

### Metrics

The system tracks:
- Message throughput (sent/received per minute)
- Session status (connected/disconnected/error)
- API response times
- Memory usage and leaks
- CPU utilization
- Database query performance
- WebSocket connections
- Error rates

### Logging

Logs are written to:
- Console (development)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

Log format: JSON with timestamps, levels, and metadata

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Commit with conventional commits: `git commit -m "feat: add amazing feature"`
7. Push to your fork: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier configurations
- Write tests for new features
- Document public APIs with JSDoc
- Keep functions small and focused

---

## 📜 License

This project is licensed under the GNU Lesser General Public License v3.0 or later.

Copyright (C) 2021-2024 WPPConnect Team

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

See [LICENSE.md](./LICENSE.md) for details.

---

## 🙏 Acknowledgments

- WhatsApp Web for the amazing platform
- Puppeteer team for browser automation
- All contributors and maintainers

---

## 📞 Support & Community

[![Discord](https://img.shields.io/discord/844351092758413353?color=blueviolet&label=Discord&logo=discord&style=flat)](https://discord.gg/JU5JGGKGNG)
[![Telegram Group](https://img.shields.io/badge/Telegram-Group-32AFED?logo=telegram)](https://t.me/wppconnect)
[![WhatsApp Group](https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp)](https://chat.whatsapp.com/LJaQu6ZyNvnBPNAVRbX00K)
[![YouTube](https://img.shields.io/youtube/channel/subscribers/UCD7J9LG08PmGQrF5IS7Yv9A?label=YouTube)](https://www.youtube.com/c/wppconnect)

---

**Made with ❤️ by the WPPConnect Team**
