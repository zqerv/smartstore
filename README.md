# 🛒 SmartStore

Enterprise-grade multi-tenant SaaS e-commerce platform for building unlimited white-label stores for different businesses.

**Built for:**
- Flower shops
- Mini markets
- Grocery stores
- Perfume stores
- Clothing stores
- Gift stores
- Restaurants and more

## 🌟 Features

- **Multi-Tenant Architecture**: Create unlimited stores with complete isolation
- **White-Label Branding**: Each store has its own logo, colors, theme, and branding
- **Customer-Facing Storefront**: Modern, mobile-first, RTL-ready e-commerce experience
- **Comprehensive Admin Dashboard**: Manage products, orders, customers, inventory, etc.
- **Platform Admin Area**: Manage stores at the platform level
- **Delivery & Payments**: Built-in support for delivery zones and multiple payment methods
- **Real-time Order Updates**: Socket.IO integration for live order tracking
- **Multi-language Support**: Built-in Arabic/English/RTL support
- **Image Uploads**: User-friendly file upload system

## 📋 Requirements

- Node.js 18+
- PostgreSQL 14+
- npm or yarn or pnpm

## 🚀 Quick Start

### Installation

```bash
git clone <repository-url>
cd smartstore
npm run install:all
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

### Database Setup

```bash
npm run prisma:generate
cd server && npx prisma migrate deploy --schema prisma/schema.prisma
```

Demo stores and accounts are created automatically when the server starts with `DEMO_MODE=true`.

### Development

```bash
npm run dev
# or run separately
npm run dev:backend      # Terminal 1
npm run dev:frontend    # Terminal 2
```

### Build

```bash
npm run build
npm start
```

### Production frontend (Vercel)

The client uses `import.meta.env.VITE_API_URL` and
`import.meta.env.VITE_SOCKET_URL`. The public production defaults in
[client/.env.production](client/.env.production) are:

```env
VITE_API_URL=https://smartstore-7pbc.onrender.com/api
VITE_SOCKET_URL=https://smartstore-7pbc.onrender.com
```

Set the same values in Vercel's Production environment settings if overrides
are configured. Vercel environment variables take precedence over the checked-in
defaults. Redeploy after changing them: Vite embeds these values at build time.
Login uses `POST https://smartstore-7pbc.onrender.com/api/auth/login`.
With `NODE_ENV=production`, the backend includes
`https://vayron-store.vercel.app` in the shared API and Socket.IO CORS allowlist,
while preserving additional origins configured through `CORS_ORIGIN`.
Redeploy the Render backend as well as the Vercel client when applying this fix.

Local development can use [client/.env.example](client/.env.example); localhost
fallbacks are enabled only by Vite's development mode. Do not copy local URL
values into Vercel's Production settings.

Database-free validation:

```bash
npm run test --workspace client
npm run typecheck --workspace client
npm run build --workspace client
npm run test:cors --workspace server
```

## 📁 Project Structure

```
SmartStore/
├── client/                 # React + Vite Frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── layouts/        # Layout components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API service calls
│   │   ├── lib/            # Utilities and configs
│   │   ├── contexts/       # Context providers
│   │   ├── types/          # TypeScript types
│   │   └── assets/         # Static assets
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── server/                 # Node.js + Express Backend
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── routes/         # API route definitions
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   ├── socket/         # WebSocket handlers
│   │   ├── lib/            # Utilities and configs
│   │   ├── validators/     # Zod validation schemas
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Helper functions
│   │   └── server.ts       # Main entry point
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Demo data
│   └── package.json
├── shared/                 # Shared types and utilities
│   └── package.json
├── .env.example            # Environment variables template
├── .gitignore
├── package.json            # Monorepo root
└── README.md
```

## 🗄️ Database Schema

Core Models:
- **Store**: Multi-tenant store configuration
- **User**: Platform and store administrators
- **Customer**: Store customers
- **Product**: Products with multi-language support
- **Category**: Product categories
- **Order**: Orders with status tracking
- **CartItem**: Shopping cart items
- **DeliveryZone**: Delivery zones and pricing
- **Coupon**: Discount coupons
- **OrderItem**: Order line items

## 🔐 API Endpoints

### Authentication
- `POST /api/auth/register`: Register new customer
- `POST /api/auth/login`: Login customer
- `POST /api/auth/verify-otp`: Verify OTP

### Products
- `GET /api/stores/:storeId/products`: List products
- `GET /api/stores/:storeId/products/:id`: Get product details
- `POST /api/stores/:storeId/products`: Create product
- `PUT /api/stores/:storeId/products/:id`: Update product
- `DELETE /api/stores/:storeId/products/:id`: Delete product

### Orders
- `POST /api/orders`: Create order
- `GET /api/orders`: List user's orders
- `PUT /api/stores/:storeId/orders/:id/status`: Update order status (admin)

### Cart
- `GET /api/cart`: Get cart
- `POST /api/cart/items`: Add item
- `DELETE /api/cart/items/:id`: Remove item

### Platform Admin (Super Admin)
- `GET /api/platform/stores`: List all stores
- `POST /api/platform/stores`: Create store
- `GET /api/platform/stores/:id/stats`: Store statistics

## 🌐 Supported Languages

- Arabic (primary): `ar-SA`
- English: `en-US`
- RTL/LTR switching supported

## 🔧 Development Scripts

```bash
npm run install:all          # Install all dependencies
npm run dev                  # Run development servers
npm run build                # Build both frontend and backend
npm start                    # Start production server
npm run prisma:generate      # Generate Prisma Client
npm run prisma:validate      # Validate the Prisma schema
```

## 🔐 Security Features

- JWT-based authentication
- Role-based authorization (PLATFORM_ADMIN, STORE_OWNER, STORE_ADMIN, STAFF, CUSTOMER)
- Tenant data isolation (scoped queries by storeId)
- Input validation with Zod
- SQL injection protection (Prisma)
- Rate limiting
- CORS configuration
- Secure cookie handling
- Helmet security headers
- Environment variable protection

## 📪 Features Roadmap

Phase 1 ✅: Project structure, React/Vite, Express/TypeScript, Basic endpoints

Planned: Full authentication, Customer storefront, Delivery, Payment, Admin dashboards

---

MIT License

For issues and questions, please check the GitHub repository or email support@smartstore.com