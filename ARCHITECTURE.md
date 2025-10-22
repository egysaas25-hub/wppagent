# System Architecture

This document provides a comprehensive overview of the WPPConnect WhatsApp Agent System architecture, including component interactions, data flow, and design decisions.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Multi-Tenancy Architecture](#multi-tenancy-architecture)
- [Real-Time Communication](#real-time-communication)
- [Security Architecture](#security-architecture)
- [Scalability & Performance](#scalability--performance)
- [Deployment Architecture](#deployment-architecture)

---

## Overview

WPPConnect is built using a layered architecture pattern with clear separation of concerns:

- **Presentation Layer**: REST API and WebSocket endpoints
- **Application Layer**: Business logic and orchestration
- **Domain Layer**: Core business entities and rules
- **Infrastructure Layer**: External services and data persistence

### Key Design Principles

1. **Separation of Concerns**: Each layer has a specific responsibility
2. **Dependency Inversion**: Higher layers depend on abstractions, not implementations
3. **Single Responsibility**: Each module/service has one reason to change
4. **Open/Closed**: Open for extension, closed for modification
5. **Modularity**: Loosely coupled, highly cohesive components

---

## System Architecture

### High-Level Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Client Applications                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │Web Browser │  │Mobile App  │  │Third Party │  │  Admin     │     │
│  │   (SPA)    │  │   (iOS/    │  │   API      │  │  Dashboard │     │
│  │            │  │  Android)  │  │Integration │  │            │     │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │
└────────┼───────────────┼───────────────┼───────────────┼────────────┘
         │               │               │               │
         │               │               │               │
         └───────────────┴───────┬───────┴───────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Load Balancer/Proxy   │
                    │    (nginx/traefik)      │
                    └────────────┬────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────┐
│                         API Gateway Layer                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Express.js Server                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │  │
│  │  │ HTTP Server  │  │   WebSocket  │  │   Socket.io  │       │  │
│  │  │  (REST API)  │  │    Server    │  │   Namespace  │       │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────── Middleware Stack ──────────────────────┐   │
│  │ → CORS → Helmet → Rate Limiter → Body Parser → Logger       │   │
│  │ → Authentication (JWT) → Tenant Context → Validation        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                      Application Layer                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     Route Handlers                             │ │
│  │  ┌──────┐  ┌────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐  │ │
│  │  │ Auth │  │Session │  │ Message │  │ Tenant  │  │Analytics│ │ │
│  │  │Routes│  │ Routes │  │ Routes  │  │ Routes  │  │ Routes │  │ │
│  │  └──────┘  └────────┘  └─────────┘  └─────────┘  └────────┘  │ │
│  │  ┌──────┐  ┌────────┐  ┌─────────┐  ┌─────────┐              │ │
│  │  │Backup│  │ Health │  │ Contact │  │  Group  │              │ │
│  │  │Routes│  │ Routes │  │ Routes  │  │ Routes  │              │ │
│  │  └──────┘  └────────┘  └─────────┘  └─────────┘              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     Controllers                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │ │
│  │  │     Auth     │  │   Session    │  │   Message    │        │ │
│  │  │  Controller  │  │  Controller  │  │  Controller  │        │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│                       Business Logic Layer                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Core Services                             │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │  │
│  │  │  Auth Service    │  │ Session Manager  │  │   Tenant    │  │  │
│  │  │  - JWT Token     │  │ - Create Session │  │   Service   │  │  │
│  │  │  - User Mgmt     │  │ - QR Code Gen    │  │ - Isolation │  │  │
│  │  │  - Permissions   │  │ - Status Track   │  │ - Quotas    │  │  │
│  │  └──────────────────┘  └──────────────────┘  └─────────────┘  │  │
│  │                                                                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │  │
│  │  │Analytics Service │  │  Backup Service  │  │   Health    │  │  │
│  │  │ - Metrics Track  │  │ - Auto Backup    │  │   Monitor   │  │  │
│  │  │ - Dashboard Data │  │ - Restore DB     │  │ - Probes    │  │  │
│  │  │ - Trends         │  │ - Export Data    │  │ - Metrics   │  │  │
│  │  └──────────────────┘  └──────────────────┘  └─────────────┘  │  │
│  │                                                                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │  │
│  │  │WebSocket Service │  │ Presence Service │  │   Message   │  │  │
│  │  │ - Real-time Conn │  │ - Online Status  │  │   Service   │  │  │
│  │  │ - Event Emitter  │  │ - Typing Ind.    │  │ - Queue     │  │  │
│  │  │ - Room Mgmt      │  │ - Activity Track │  │ - Delivery  │  │  │
│  │  └──────────────────┘  └──────────────────┘  └─────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                   Utility Services                             │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │  │ Retry Utils  │  │Memory Monitor│  │Rate Limiter  │         │  │
│  │  │- Exponential │  │- Leak Detect │  │- Token Bucket│         │  │
│  │  │- Backoff     │  │- GC Trigger  │  │- Per Tenant  │         │  │
│  │  │- Circuit Br. │  │- Cleanup     │  │- Sliding Win │         │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│                          Domain Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                      Models & Entities                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │  │
│  │  │  User    │  │ Session  │  │ Message  │  │  Tenant  │       │  │
│  │  │  Model   │  │  Model   │  │  Model   │  │  Model   │       │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │  │
│  │  │ Contact  │  │Analytics │  │  Backup  │                     │  │
│  │  │  Model   │  │  Model   │  │  Model   │                     │  │
│  │  └──────────┘  └──────────┘  └──────────┘                     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────┐
│                      Infrastructure Layer                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Data Access Layer                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │  │   Database   │  │  Migration   │  │   Query      │         │  │
│  │  │  Connection  │  │   Manager    │  │   Builder    │         │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    Storage Layer                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │  │   SQLite     │  │  File System │  │   Cache      │         │  │
│  │  │   Database   │  │  (Sessions,  │  │  (In-Memory) │         │  │
│  │  │              │  │   Media)     │  │              │         │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                External Services Layer                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │  │  Puppeteer   │  │  WhatsApp    │  │   Webhook    │         │  │
│  │  │  (Browser)   │  │  Web Client  │  │   Delivery   │         │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. API Gateway Layer

The API Gateway is the entry point for all client requests.

**Components:**
- **Express Server**: HTTP server handling REST API requests
- **Socket.io Server**: WebSocket server for real-time communication
- **Middleware Stack**: Request processing pipeline

**Responsibilities:**
- Request routing and validation
- Authentication and authorization
- Rate limiting and throttling
- Request/response transformation
- Error handling
- CORS and security headers

**Key Files:**
- `src/app.ts` - Express application configuration
- `src/server.ts` - HTTP/WebSocket server initialization
- `src/middleware/` - Middleware implementations

### 2. Application Layer

Handles HTTP requests and orchestrates business logic.

**Components:**
- **Route Handlers**: Define API endpoints
- **Controllers**: Handle request/response logic
- **Validators**: Input validation and sanitization

**Responsibilities:**
- Request handling
- Input validation
- Response formatting
- Error transformation

**Key Files:**
- `src/routes/` - API route definitions
- `src/controllers/` - Request controllers
- `src/middleware/validators.middleware.ts`

### 3. Business Logic Layer

Contains core business logic and services.

**Components:**
- **Session Manager**: WhatsApp session lifecycle management
- **Analytics Service**: Metrics and reporting
- **Backup Service**: Database backup and restore
- **WebSocket Service**: Real-time communication
- **Health Monitor**: System health checks
- **Tenant Service**: Multi-tenancy management

**Responsibilities:**
- Business rule enforcement
- Service orchestration
- Event handling
- Background job processing

**Key Files:**
- `src/services/` - Business logic services
- `src/api/whatsapp.ts` - WhatsApp Web integration

### 4. Domain Layer

Defines core business entities and models.

**Components:**
- **Models**: Data entities (User, Session, Message, Tenant)
- **Types**: TypeScript type definitions
- **Business Rules**: Domain-specific logic

**Responsibilities:**
- Data structure definition
- Business entity behavior
- Domain validation

**Key Files:**
- `src/models/` - Data models
- `src/types/` - TypeScript types

### 5. Infrastructure Layer

Handles external dependencies and data persistence.

**Components:**
- **Database**: SQLite connection and queries
- **File System**: Session and media storage
- **External Services**: Puppeteer, WhatsApp Web

**Responsibilities:**
- Data persistence
- External service integration
- Infrastructure concerns

**Key Files:**
- `src/config/database.ts` - Database configuration
- `src/config/migrations.ts` - Database migrations
- `src/utils/database.utils.ts` - Database utilities

---

## Data Flow

### Request Flow Diagram

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ 1. HTTP Request
     ▼
┌─────────────────┐
│  Load Balancer  │
└────┬────────────┘
     │
     │ 2. Forward Request
     ▼
┌─────────────────────────────────────────┐
│         API Gateway Layer               │
│  ┌───────────────────────────────────┐  │
│  │  Middleware Pipeline              │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 3. CORS & Security Headers  │  │  │
│  │  └─────────┬───────────────────┘  │  │
│  │            │                       │  │
│  │  ┌─────────▼───────────────────┐  │  │
│  │  │ 4. Rate Limiting            │  │  │
│  │  └─────────┬───────────────────┘  │  │
│  │            │                       │  │
│  │  ┌─────────▼───────────────────┐  │  │
│  │  │ 5. Authentication (JWT)     │  │  │
│  │  └─────────┬───────────────────┘  │  │
│  │            │                       │  │
│  │  ┌─────────▼───────────────────┐  │  │
│  │  │ 6. Tenant Context           │  │  │
│  │  └─────────┬───────────────────┘  │  │
│  │            │                       │  │
│  │  ┌─────────▼───────────────────┐  │  │
│  │  │ 7. Input Validation         │  │  │
│  │  └─────────┬───────────────────┘  │  │
│  └────────────┼───────────────────────┘  │
└───────────────┼──────────────────────────┘
                │
     ┌──────────▼──────────┐
     │ 8. Route Handler    │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ 9. Controller       │
     └──────────┬──────────┘
                │
┌───────────────▼────────────────────────┐
│      Business Logic Layer              │
│  ┌──────────────────────────────────┐  │
│  │ 10. Service Layer                │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │ Business Logic Execution   │  │  │
│  │  └──────────┬─────────────────┘  │  │
│  └─────────────┼────────────────────┘  │
└────────────────┼───────────────────────┘
                 │
┌────────────────▼───────────────────────┐
│       Domain Layer                     │
│  ┌──────────────────────────────────┐  │
│  │ 11. Model Operations             │  │
│  └──────────┬───────────────────────┘  │
└─────────────┼──────────────────────────┘
              │
┌─────────────▼──────────────────────────┐
│    Infrastructure Layer                │
│  ┌──────────────────────────────────┐  │
│  │ 12. Database Query               │  │
│  └──────────┬───────────────────────┘  │
│             │                           │
│  ┌──────────▼───────────────────────┐  │
│  │ 13. Data Persistence             │  │
│  └──────────┬───────────────────────┘  │
└─────────────┼──────────────────────────┘
              │
              │ 14. Return Data
              │
     ┌────────▼──────────┐
     │ Controller         │
     │ (Format Response)  │
     └────────┬───────────┘
              │
              │ 15. HTTP Response
              ▼
         ┌─────────┐
         │ Client  │
         └─────────┘
```

### Message Flow (WhatsApp)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Send Message Flow                            │
└─────────────────────────────────────────────────────────────────┘

Client App
    │
    │ POST /api/v1/sessions/{session}/messages
    ▼
┌──────────────┐
│Message Route │
└──────┬───────┘
       │
       │ 1. Validate input
       ▼
┌─────────────────┐
│Message Controller│
└──────┬──────────┘
       │
       │ 2. Authorize session access
       ▼
┌───────────────────┐
│ Session Manager   │
└──────┬────────────┘
       │
       │ 3. Get session
       ▼
┌────────────────────┐
│ Message Service    │
└──────┬─────────────┘
       │
       │ 4. Queue message
       ▼
┌────────────────────┐
│ WhatsApp Client    │
│ (via Puppeteer)    │
└──────┬─────────────┘
       │
       │ 5. Send to WhatsApp Web
       ▼
┌────────────────────┐
│ WhatsApp Servers   │
└──────┬─────────────┘
       │
       │ 6. Message ACK
       ▼
┌────────────────────┐
│ Webhook Service    │
└──────┬─────────────┘
       │
       │ 7. Trigger webhook
       ▼
┌────────────────────┐
│ Analytics Service  │
└──────┬─────────────┘
       │
       │ 8. Track metrics
       ▼
  Database (Update)
```

---

## Multi-Tenancy Architecture

### Tenant Isolation Model

```
┌──────────────────────────────────────────────────────────────┐
│                      Tenant Architecture                      │
└──────────────────────────────────────────────────────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Tenant A   │  │  Tenant B   │  │  Tenant C   │
│             │  │             │  │             │
│ Users: 5    │  │ Users: 10   │  │ Users: 3    │
│ Sessions: 2 │  │ Sessions: 5 │  │ Sessions: 1 │
│ Plan: Pro   │  │ Plan: Enter │  │ Plan: Basic │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  Tenant Middleware     │
           │  - Extract tenant_id   │
           │  - Check quota         │
           │  - Apply settings      │
           └────────────┬───────────┘
                        │
                        ▼
           ┌────────────────────────┐
           │  Tenant Context        │
           │  (Request Scoped)      │
           └────────────┬───────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
   ┌────────────────┐      ┌────────────────┐
   │  Data Access   │      │  Rate Limiter  │
   │  (Filtered by  │      │  (Per Tenant)  │
   │   tenant_id)   │      │                │
   └────────────────┘      └────────────────┘
```

**Tenant Isolation Features:**

1. **Data Isolation**: All queries automatically filtered by `tenant_id`
2. **Resource Quotas**: Per-tenant limits (sessions, users, API calls)
3. **Settings Isolation**: Custom configurations per tenant
4. **Rate Limiting**: Independent rate limits per tenant
5. **Analytics**: Separate metrics and reporting

**Implementation:**

```typescript
// src/middleware/tenant.middleware.ts
export const tenantContext = async (req, res, next) => {
  // Extract tenant from JWT or header
  const tenantId = req.user?.tenant_id;

  // Load tenant settings
  const tenant = await TenantModel.findById(tenantId);

  // Attach to request context
  req.tenant = tenant;
  req.tenantId = tenantId;

  // Check quotas
  if (await tenant.hasReachedLimit()) {
    return res.status(429).json({ error: 'Quota exceeded' });
  }

  next();
};
```

---

## Real-Time Communication

### WebSocket Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                WebSocket Communication Flow                   │
└──────────────────────────────────────────────────────────────┘

Client                          Server
  │                               │
  │  1. Connect (Socket.io)       │
  ├──────────────────────────────►│
  │                               │
  │  2. Auth (JWT Token)          │
  ├──────────────────────────────►│
  │                               │
  │  3. Join Tenant Room          │
  │◄──────────────────────────────┤
  │                               │
  │  4. Subscribe to Events       │
  ├──────────────────────────────►│
  │                               │
  │  5. Presence Update           │
  │◄──────────────────────────────┤
  │                               │
  │  6. Session Events            │
  │◄──────────────────────────────┤
  │                               │
  │  7. Typing Indicator          │
  ├──────────────────────────────►│
  │◄──────────────────────────────┤
  │                               │
  │  8. Message Notifications     │
  │◄──────────────────────────────┤
  │                               │
  │  9. Analytics Updates         │
  │◄──────────────────────────────┤
  │                               │
  │  10. Disconnect               │
  ├──────────────────────────────►│
  │                               │
```

**WebSocket Namespaces:**

```
/                           # Default namespace
  ├─ /sessions             # Session events
  ├─ /analytics            # Real-time analytics
  └─ /admin                # Admin dashboard
```

**Event Types:**

- `session:connected` - Session connected to WhatsApp
- `session:qr` - QR code updated
- `session:disconnected` - Session disconnected
- `message:received` - New message received
- `message:sent` - Message sent successfully
- `presence:online` - User came online
- `presence:offline` - User went offline
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `analytics:update` - Analytics data updated

---

## Security Architecture

### Security Layers

```
┌──────────────────────────────────────────────────────────────┐
│                     Security Architecture                     │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network Security                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    HTTPS    │  │   Firewall  │  │     DDoS    │        │
│  │   (TLS 1.3) │  │    Rules    │  │  Protection │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Application Gateway Security                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   CORS      │  │   Helmet    │  │Rate Limiting│        │
│  │  Protection │  │   Headers   │  │ (Per Tenant)│        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Authentication & Authorization                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     JWT     │  │    RBAC     │  │   Session   │        │
│  │    Tokens   │  │(Role-Based) │  │ Management  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Data Security                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Encryption  │  │  Password   │  │   Input     │        │
│  │  at Rest    │  │  Hashing    │  │ Validation  │        │
│  │  (AES-256)  │  │  (bcrypt)   │  │ Sanitization│        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Audit & Monitoring                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Logging   │  │   Metrics   │  │   Alerts    │        │
│  │  (Winston)  │  │  Tracking   │  │  & Notify   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
User                     Server                    Database
 │                        │                           │
 │  POST /auth/login      │                           │
 ├───────────────────────►│                           │
 │  {email, password}     │                           │
 │                        │  Query user by email      │
 │                        ├──────────────────────────►│
 │                        │                           │
 │                        │  Return user + hash       │
 │                        │◄──────────────────────────┤
 │                        │                           │
 │                        │  Verify password          │
 │                        │  (bcrypt.compare)         │
 │                        │                           │
 │                        │  Generate JWT             │
 │                        │  (sign with secret)       │
 │                        │                           │
 │  Return JWT token      │                           │
 │◄───────────────────────┤                           │
 │                        │                           │
 │  API Request           │                           │
 │  + Authorization header│                           │
 ├───────────────────────►│                           │
 │                        │                           │
 │                        │  Verify JWT signature     │
 │                        │  Check expiration         │
 │                        │  Extract user ID          │
 │                        │                           │
 │                        │  Process request          │
 │                        │                           │
 │  Response              │                           │
 │◄───────────────────────┤                           │
```

---

## Scalability & Performance

### Horizontal Scaling Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Load Balancer (nginx/HAProxy)               │
│                  - Round Robin / Least Connections           │
│                  - Health Checks                             │
│                  - SSL Termination                           │
└──────────────┬──────────────┬──────────────┬─────────────────┘
               │              │              │
     ┌─────────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
     │  App Server 1  │ │App Server 2│ │App Server 3│
     │  (Node.js)     │ │(Node.js)   │ │(Node.js)   │
     │  - REST API    │ │- REST API  │ │- REST API  │
     │  - WebSocket   │ │- WebSocket │ │- WebSocket │
     └────────┬───────┘ └────┬───────┘ └────┬───────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
               ┌─────────────▼─────────────┐
               │   Shared Database         │
               │   - SQLite (Dev)          │
               │   - PostgreSQL (Prod)     │
               │   - Read Replicas         │
               └───────────────────────────┘
```

### Performance Optimizations

**1. Caching Strategy**

```
Request → Cache Check → Hit? → Return Cached Data
              ↓
             Miss
              ↓
         Database Query
              ↓
         Cache Update
              ↓
        Return Data
```

**2. Connection Pooling**

```typescript
// Database connection pool
const pool = new Pool({
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**3. Query Optimization**

- Indexed queries on frequently accessed columns
- Prepared statements for repeated queries
- Batch operations for bulk inserts/updates
- Lazy loading for related data

**4. Memory Management**

- Periodic garbage collection monitoring
- Memory leak detection
- Resource cleanup on process exit
- Stream processing for large files

---

## Deployment Architecture

### Docker Deployment

```
┌────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                     │
└────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  nginx-proxy                                                │
│  - SSL Termination                                          │
│  - Reverse Proxy                                            │
│  - Load Balancing                                           │
└────────────────┬────────────────────────────────────────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
┌────▼────┐ ┌───▼────┐ ┌───▼────┐
│wppconn-1│ │wppconn-2│ │wppconn-3│
│(Node.js)│ │(Node.js)│ │(Node.js)│
└────┬────┘ └───┬────┘ └───┬────┘
     └───────────┼───────────┘
                 │
        ┌────────▼────────┐
        │   PostgreSQL    │
        │   - Primary     │
        └─────────────────┘
                 │
        ┌────────▼────────┐
        │     Redis       │
        │   - Cache       │
        │   - Sessions    │
        └─────────────────┘
                 │
        ┌────────▼────────┐
        │  Volume Storage │
        │  - Database     │
        │  - Sessions     │
        │  - Backups      │
        └─────────────────┘
```

### Kubernetes Deployment

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
└────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Ingress Controller (nginx/traefik)                          │
│  - SSL/TLS Termination                                       │
│  - Path-based Routing                                        │
│  - Rate Limiting                                             │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  Service (LoadBalancer/ClusterIP)                            │
│  - Session Affinity                                          │
│  - Health Checks                                             │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  Deployment (wppconnect)                                     │
│  Replicas: 3                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Pod 1    │  │   Pod 2    │  │   Pod 3    │            │
│  │ Container  │  │ Container  │  │ Container  │            │
│  │ (Node.js)  │  │ (Node.js)  │  │ (Node.js)  │            │
│  │ Resources: │  │ Resources: │  │ Resources: │            │
│  │ CPU: 500m  │  │ CPU: 500m  │  │ CPU: 500m  │            │
│  │ Mem: 512Mi │  │ Mem: 512Mi │  │ Mem: 512Mi │            │
│  │ Probes:    │  │ Probes:    │  │ Probes:    │            │
│  │ - Liveness │  │ - Liveness │  │ - Liveness │            │
│  │ - Readiness│  │ - Readiness│  │ - Readiness│            │
│  └────────────┘  └────────────┘  └────────────┘            │
└──────────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  StatefulSet (Database)                                      │
│  ┌────────────────────────────────────────────┐             │
│  │  PostgreSQL Primary                        │             │
│  │  - PersistentVolumeClaim (10Gi)            │             │
│  │  - Backup CronJob (Daily)                  │             │
│  └────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  ConfigMaps & Secrets                                        │
│  - Environment Variables                                     │
│  - JWT Secrets                                               │
│  - Database Credentials                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## Design Decisions & Rationale

### 1. **Why SQLite for Development?**

- **Simplicity**: Zero configuration, file-based
- **Portability**: Works across all platforms
- **Performance**: Fast for single-server deployments
- **Upgrade Path**: Easy migration to PostgreSQL for production

### 2. **Why Layered Architecture?**

- **Separation of Concerns**: Each layer has a specific responsibility
- **Testability**: Easy to mock dependencies and test in isolation
- **Maintainability**: Changes in one layer don't affect others
- **Flexibility**: Easy to swap implementations (e.g., database)

### 3. **Why Multi-Tenancy?**

- **Resource Efficiency**: Share infrastructure across tenants
- **Cost Reduction**: Lower operational costs per tenant
- **Scalability**: Easier to scale horizontally
- **Customization**: Per-tenant settings and quotas

### 4. **Why WebSocket for Real-Time?**

- **Bi-directional**: Server can push updates to clients
- **Low Latency**: Persistent connection, no polling overhead
- **Efficiency**: Less bandwidth than HTTP polling
- **Real-time**: Instant updates for session events

### 5. **Why JWT for Authentication?**

- **Stateless**: No server-side session storage required
- **Scalable**: Works across multiple servers
- **Portable**: Can be validated independently
- **Secure**: Cryptographically signed tokens

---

## Future Architecture Improvements

### Planned Enhancements

1. **Microservices Migration**
   - Split services into independent containers
   - Use message queue (RabbitMQ/Kafka) for communication
   - Independent scaling per service

2. **Caching Layer**
   - Redis for session caching
   - API response caching
   - Database query result caching

3. **Message Queue**
   - Decouple message sending from API requests
   - Retry failed messages automatically
   - Priority queues for different message types

4. **Database Sharding**
   - Horizontal partitioning by tenant
   - Read replicas for analytics queries
   - Automatic failover

5. **Observability**
   - Distributed tracing (Jaeger/Zipkin)
   - Centralized logging (ELK stack)
   - Metrics dashboard (Grafana/Prometheus)

---

**Document Version**: 1.0
**Last Updated**: 2024
**Author**: WPPConnect Team
