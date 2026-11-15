# Environment Configuration & Network Architecture Guide

**Project:** Sree Hari Sweets & Snacks Mobile Application  
**Target Runtimes:** Expo Mobile App (iOS / Android), Node.js / Express Backend, PostgreSQL  

---

## 1. Overview & Core Principles

The mobile application is engineered to strictly distinguish between **local development** and **production** environments without hardcoding IP addresses or domains into screens or service components.

### Core Architectural Rules:
1. **Zero Hardcoded URLs:** No screen, component, or store file directly writes `http://localhost`, `10.0.2.2`, or a production domain.
2. **Centralized Resolver:** All network calls flow through `src/config/apiUrl.ts` via `resolveApiUrl()`.
3. **Environment Isolation:** Secrets, database credentials, and service tokens are strictly kept in the backend (`backend/env-backend/.env`). The mobile application only accesses public environment variables prefixed with `EXPO_PUBLIC_`.
4. **Physical Device LAN Auto-Detection:** During local development with Expo Metro, the app automatically identifies the host computer's LAN IP address from the Metro bundler manifest, enabling instant testing on physical Android and iOS devices on the same Wi-Fi network without manual IP editing.

---

## 2. Configuration Files

### 2.1 `.env.development` (Mobile Local Development)
```bash
# Sree Hari Mobile - Development Environment
EXPO_PUBLIC_APP_ENV=development

# Optional override: leave empty to let Metro automatically resolve your machine's LAN IP
# EXPO_PUBLIC_API_URL=http://192.168.1.100:8000/api

# Local Backend Port
EXPO_PUBLIC_LOCAL_API_PORT=8000
```

### 2.2 `.env.production` (Mobile Production)
```bash
# Sree Hari Mobile - Production Environment
EXPO_PUBLIC_APP_ENV=production

# Production API Endpoint (HTTPS mandatory)
EXPO_PUBLIC_API_URL=https://api.sreeharisweets.com/api
```

---

## 3. How `resolveApiUrl` Works

The resolver in `src/config/apiUrl.ts` evaluates the active configuration at startup:

```typescript
export function resolveApiUrl(options?: ResolveOptions): string {
  // 1. Explicit override via EXPO_PUBLIC_API_URL
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }

  // 2. Production Mode: strictly requires HTTPS production URL
  if (process.env.EXPO_PUBLIC_APP_ENV === 'production') {
    throw new Error('EXPO_PUBLIC_API_URL must be defined for production builds.');
  }

  // 3. Development Mode: Auto-resolve from Metro Bundler host
  const host = getMetroHost() || 'localhost';
  const port = process.env.EXPO_PUBLIC_LOCAL_API_PORT || '8000';
  return `http://${host}:${port}/api`;
}
```

### Host Mapping Table:
| Runtime Environment | Resolved API Host | Description |
|---|---|---|
| **Physical Phone (Expo Go / Dev Build)** | `http://<YOUR_LAN_IP>:8000/api` | Automatically extracted from Metro manifest. |
| **Android Emulator** | `http://10.0.2.2:8000/api` or LAN IP | Supported out-of-the-box. |
| **iOS Simulator** | `http://localhost:8000/api` | Direct local loopback. |
| **Production Release (EAS Build / APK)** | `https://api.sreeharisweets.com/api` | Secure SSL endpoint enforced. |

---

## 4. Running the Application Locally

### Step 1: Start the Backend
```powershell
cd 08-11-2026/backend/env-backend
npm run dev
# The backend server starts listening on http://0.0.0.0:8000
```

### Step 2: Start the Mobile App
```powershell
cd 08-11-2026/mobile/AGENTS
npm start
# Metro Bundler will display a QR code for Expo Go / Dev Client
```

---

## 5. Automated Verification
The environment resolution logic is covered by automated unit tests in `src/config/apiUrl.test.ts`:
- Development Metro host extraction.
- Production HTTPS requirement and trailing slash sanitization.
- Error throwing on malformed or insecure production URLs.
- Manual override prioritization.
