# CareBridge+ Backend ⚙️

The robust Node.js server powering the CareBridge+ platform. It manages healthcare data, user authorizations, and referral tracking.

## 🚀 Technology Stack

*   **Runtime**: Node.js
*   **Framework**: [Express](https://expressjs.com/)
*   **Database**: [SQLite](https://www.sqlite.org/) (via `better-sqlite3`)
*   **Execution**: [tsx](https://github.com/privatenumber/tsx) for fast TypeScript execution in development.

## 📂 Project Structure

*   `server.ts`: The main entry point containing API routes and database initialization logic.
*   `carebridge.db`: SQLite database file (automatically initialized on startup).
*   `server.log`: Automated request and error logging.

## 🔑 Core Features

1.  **RBAC (Role-Based Access Control)**: Managed via the `users` table supporting Admin, Hospital, Clinic, and Patient roles.
2.  **Automated Seeding**: The server automatically initializes default administrative and facility accounts if the database is empty.
3.  **Referral Engine**: Tracks patient transfers between clinics and hospitals.
4.  **Messaging System**: Internal broadcast and individual messaging for system updates.

## 🛠️ Getting Started

### Installation
```bash
# Install dependencies
npm install

# Start development server with hot-reload (Port 3000)
npm run dev
```

### Environment Variables
Create a `.env` file in the backend directory:
```env
PORT=3000
NODE_ENV=development
```

## 🔌 API Endpoints (Brief)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/login` | POST | User authentication |
| `/api/register` | POST | New user registration (Approval based) |
| `/api/referrals` | GET/POST | Referral management |
| `/api/messages` | GET/POST | System notifications |
| `/api/approvals` | GET/PATCH | Admin user approval flow |

---
*Powered by CareBridge+ Cloud Services*
