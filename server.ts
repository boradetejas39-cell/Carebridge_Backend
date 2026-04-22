import fs from "fs";
import { fileURLToPath } from "url";
import express from "express";
import Database from "better-sqlite3";
import path from "path";
import "dotenv/config";

const logFile = "server.log";
const log = (msg: string) => {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const formattedMsg = `[${timestamp}] ${msg}`;
  console.log(formattedMsg);
  try {
    fs.appendFileSync(logFile, formattedMsg + "\n");
  } catch (err) {
    // Ignore logging errors
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

log("[Server] Starting CareBridge+ Backend...");

process.on('uncaughtException', (err) => {
  log(`[Server] Uncaught Exception: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`[Server] Unhandled Rejection at: ${promise} reason: ${reason}`);
});

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  const PORT = Number(process.env.PORT) || 3000;

  // ─── Middleware ──────────────────────────────────────────────────────────────
  app.use(express.json());

  // CORS for development (frontend on different port)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    if (!req.url.startsWith('/assets')) {
      log(`[Request] ${req.method} ${req.url}`);
    }
    next();
  });

  // ─── Database Setup ─────────────────────────────────────────────────────────
  let db: any = null;
  try {
    log("[Server] Connecting to database...");
    db = new Database("carebridge.db");
    log("[Server] Database connected successfully");
  } catch (error: any) {
    log(`[Server] Database connection error: ${error.message}`);
  }

  // Initialize Database
  try {
    if (db) {
      log("[Server] Initializing database tables...");
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          password TEXT,
          role TEXT,
          name TEXT,
          city TEXT,
          status TEXT DEFAULT 'pending'
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      
        CREATE TABLE IF NOT EXISTS referrals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_name TEXT,
          patient_age INTEGER,
          patient_phone TEXT,
          patient_gender TEXT,
          patient_condition TEXT,
          department TEXT,
          diagnosis TEXT,
          note TEXT,
          economical_condition TEXT,
          applicable_scheme TEXT,
          doctor_id TEXT,
          doctor_name TEXT,
          clinic_id INTEGER,
          hospital_id INTEGER,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_clinic ON referrals(clinic_id);
        CREATE INDEX IF NOT EXISTS idx_referrals_hospital ON referrals(hospital_id);
        CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
      
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER,
          recipient_id INTEGER,
          recipient_role TEXT,
          title TEXT,
          content TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
        CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(recipient_role);
      
        CREATE TABLE IF NOT EXISTS hospital_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE,
          tier TEXT DEFAULT 'standard',
          schemes TEXT,
          departments TEXT,
          helpline TEXT,
          address TEXT,
          email TEXT
        );
      
        CREATE TABLE IF NOT EXISTS hospital_doctors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hospital_id INTEGER,
          name TEXT,
          qualification TEXT,
          contact TEXT
        );
      
        CREATE TABLE IF NOT EXISTS clinic_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE,
          degree TEXT,
          reg_no TEXT,
          address TEXT,
          rating INTEGER DEFAULT 5,
          doctor_name TEXT,
          qualification TEXT,
          contact_no TEXT,
          tier TEXT,
          email TEXT
        );
      `);
      
      // Fast migration check
      const tables = ['hospital_details', 'referrals', 'clinic_details'];
      tables.forEach(table => {
        const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
        const cols = info.map(c => c.name);
        
        if (table === 'hospital_details') {
          if (!cols.includes('email')) db.exec("ALTER TABLE hospital_details ADD COLUMN email TEXT");
          if (!cols.includes('address')) db.exec("ALTER TABLE hospital_details ADD COLUMN address TEXT");
        } else if (table === 'referrals') {
          if (!cols.includes('patient_gender')) db.exec("ALTER TABLE referrals ADD COLUMN patient_gender TEXT");
          if (!cols.includes('patient_condition')) db.exec("ALTER TABLE referrals ADD COLUMN patient_condition TEXT");
          if (!cols.includes('doctor_id')) db.exec("ALTER TABLE referrals ADD COLUMN doctor_id TEXT");
          if (!cols.includes('doctor_name')) db.exec("ALTER TABLE referrals ADD COLUMN doctor_name TEXT");
        } else if (table === 'clinic_details') {
          const needed = ['doctor_name', 'qualification', 'contact_no', 'reg_no', 'email', 'rating', 'tier'];
          needed.forEach(col => {
            if (!cols.includes(col)) db.exec(`ALTER TABLE clinic_details ADD COLUMN ${col} ${col === 'rating' ? 'INTEGER' : 'TEXT'}`);
          });
        }
      });
      
      // Seed initial users if empty
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
      if (userCount.count === 0) {
        log("[Server] Seeding initial data...");
        // Admin
        db.prepare("INSERT INTO users (username, password, role, name, city, status) VALUES (?, ?, ?, ?, ?, ?)").run(
          "PLUSADMIN", "plus@098", "admin", "Master Admin", "System", "active"
        );

        // Hospitals
        const hospitals = [
          ["PLUSHOSPITAL", "plus@098", "hospital", "CareBridge+ Hospital", "Aurangabad", "active"],
          ["CITYHOSP", "plus@098", "hospital", "City General Hospital", "Aurangabad", "active"],
          ["APEXHOSP", "plus@098", "hospital", "Apex Multispeciality", "Pune", "active"],
          ["SUNRISEHOSP", "plus@098", "hospital", "Sunrise Children's Hospital", "Mumbai", "active"],
          ["NEWLIFEHOSP", "plus@098", "hospital", "New Life Hospital", "Jalna", "pending"],
          ["METROCARE", "plus@098", "hospital", "Metro Care Hospital", "Pune", "pending"]
        ];
        hospitals.forEach(h => {
          db.prepare("INSERT INTO users (username, password, role, name, city, status) VALUES (?, ?, ?, ?, ?, ?)").run(...h);
        });

        // Clinics
        const clinics = [
          ["PLUSCLINIC", "plus@098", "clinic", "Patil Clinic", "Aurangabad", "active"],
          ["SHARMACLINIC", "plus@098", "clinic", "Sharma Family Clinic", "Aurangabad", "active"],
          ["WELLNESSCLINIC", "plus@098", "clinic", "Wellness Health Center", "Jalna", "active"],
          ["METRODENTAL", "plus@098", "clinic", "Metro Dental Clinic", "Pune", "active"],
          ["GLOBALEYE", "plus@098", "clinic", "Global Eye Care", "Mumbai", "active"],
          ["LIFELINECLINIC", "plus@098", "clinic", "LifeLine Clinic", "Aurangabad", "active"],
          ["GUPTACLINIC", "plus@098", "clinic", "Dr. Gupta's Clinic", "Pune", "pending"],
          ["HOPECLINIC", "plus@098", "clinic", "Hope Medical Center", "Mumbai", "pending"],
          ["CITYCLINIC", "plus@098", "clinic", "City Health Clinic", "Jalna", "pending"]
        ];
        clinics.forEach(c => {
          db.prepare("INSERT INTO users (username, password, role, name, city, status) VALUES (?, ?, ?, ?, ?, ?)").run(...c);
        });

        // Seed details for Hospitals
        const hospitalUsers = db.prepare("SELECT id, name FROM users WHERE role = 'hospital'").all() as any[];
        hospitalUsers.forEach(u => {
          db.prepare("INSERT INTO hospital_details (user_id, tier, schemes, departments, helpline, address) VALUES (?, ?, ?, ?, ?, ?)").run(
            u.id, 
            u.name === "CareBridge+ Hospital" ? "premium" : "priority", 
            "MJPJAY, PMJAY, Cashless", 
            "Orthopedics, Cardiology, Gynecology, Neurology", 
            "0240-1234567",
            `Main Road, ${u.name}`
          );
        });

        // Seed details for Clinics
        const clinicUsers = db.prepare("SELECT id, name FROM users WHERE role = 'clinic'").all() as any[];
        clinicUsers.forEach(u => {
          db.prepare("INSERT INTO clinic_details (user_id, degree, reg_no, address, doctor_name, qualification, contact_no) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            u.id, "MBBS, MD", `MMC-${10000 + u.id}`, `Clinic Street, ${u.name}`, `Dr. ${u.name.split(' ')[0]}`, "MBBS, MD", "9988776655"
          );
        });
      }
      log("[Server] Database initialization complete");
    }
  } catch (error) {
    log(`[Server] Database initialization error: ${error}`);
  }

  // ─── Health Check Routes ────────────────────────────────────────────────────
  app.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      db: !!db
    });
  });

  app.get("/ping", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(),
      env: process.env.NODE_ENV,
      db: !!db
    });
  });

  // ─── Auth Routes ────────────────────────────────────────────────────────────
  app.post("/api/login", (req, res) => {
    if (!db) return res.status(503).json({ message: "Database not ready" });
    const { username, password } = req.body;
    log(`[Auth] Login attempt for: ${username}`);
    
    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND password = ?").get(username, password) as any;
      if (user) {
        log(`[Auth] Login successful for: ${username}`);
        res.json({ success: true, user });
      } else {
        log(`[Auth] Login failed for: ${username}`);
        res.status(401).json({ success: false, message: "Invalid username or password" });
      }
    } catch (error) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/register", (req, res) => {
    if (!db) return res.status(503).json({ message: "Database not ready" });
    const { username, password, role, name, city, details } = req.body;
    
    try {
      const existingUser = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Username already exists" });
      }

      db.transaction(() => {
        const result = db.prepare("INSERT INTO users (username, password, role, name, city, status) VALUES (?, ?, ?, ?, ?, 'pending')")
          .run(username, password, role, name, city);
        const userId = result.lastInsertRowid;

        if (role === 'hospital') {
          db.prepare("INSERT INTO hospital_details (user_id, tier, schemes, departments, helpline, address, email) VALUES (?, 'standard', '', '', ?, ?, ?)")
            .run(userId, details.helpline || '', details.address || '', details.email || '');
        } else if (role === 'clinic') {
          db.prepare("INSERT INTO clinic_details (user_id, degree, reg_no, address, rating, doctor_name, qualification, contact_no, email) VALUES (?, ?, ?, ?, 5, ?, ?, ?, ?)")
            .run(userId, details.degree || '', details.reg_no || '', details.address || '', details.doctor_name || name, details.qualification || '', details.contact_no || '', details.email || '');
        }
      })();

      res.json({ success: true, message: "Registration successful. Waiting for admin approval." });
    } catch (error) {
      console.error("[Auth] Registration error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // ─── Hospital Routes ────────────────────────────────────────────────────────
  app.get("/api/hospitals", (req, res) => {
    try {
      const hospitals = db.prepare(`
        SELECT u.id, u.name, u.city, u.status, hd.tier, hd.schemes, hd.departments, hd.helpline, hd.address, hd.email
        FROM users u 
        JOIN hospital_details hd ON u.id = hd.user_id 
        WHERE u.role = 'hospital'
      `).all();
      res.json(hospitals);
    } catch (error) {
      console.error("[Server] Error fetching hospitals:", error);
      res.status(500).json({ success: false, message: "Failed to fetch hospitals" });
    }
  });

  app.get("/api/hospitals/:user_id", (req, res) => {
    try {
      const hospital = db.prepare(`
        SELECT u.id, u.name, u.city, hd.tier, hd.schemes, hd.departments, hd.helpline, hd.address, hd.email
        FROM users u
        JOIN hospital_details hd ON u.id = hd.user_id
        WHERE u.id = ?
      `).get(req.params.user_id);
      
      if (hospital) {
        const doctors = db.prepare("SELECT * FROM hospital_doctors WHERE hospital_id = ?").all(req.params.user_id);
        res.json({ ...hospital, doctors });
      } else {
        res.status(404).json({ message: "Hospital not found" });
      }
    } catch (error) {
      console.error("[Server] Error fetching hospital detail:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/hospitals/:user_id/profile", (req, res) => {
    const { name, city, helpline, address, departments, schemes, email } = req.body;
    db.transaction(() => {
      db.prepare("UPDATE users SET name = ?, city = ? WHERE id = ?").run(name, city, req.params.user_id);
      db.prepare("UPDATE hospital_details SET helpline = ?, address = ?, departments = ?, schemes = ?, email = ? WHERE user_id = ?")
        .run(helpline, address, departments, schemes, email, req.params.user_id);
    })();
    res.json({ success: true });
  });

  app.post("/api/hospitals/:user_id/doctors", (req, res) => {
    const { name, qualification, contact } = req.body;
    db.prepare("INSERT INTO hospital_doctors (hospital_id, name, qualification, contact) VALUES (?, ?, ?, ?)")
      .run(req.params.user_id, name, qualification, contact);
    res.json({ success: true });
  });

  app.delete("/api/doctors/:id", (req, res) => {
    db.prepare("DELETE FROM hospital_doctors WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // ─── Clinic Routes ──────────────────────────────────────────────────────────
  app.get("/api/clinics", (req, res) => {
    try {
      const clinics = db.prepare(`
        SELECT u.id, u.name, u.city, u.status, cd.degree, cd.reg_no, cd.address, cd.rating, cd.tier, cd.doctor_name, cd.qualification, cd.contact_no, cd.email
        FROM users u 
        JOIN clinic_details cd ON u.id = cd.user_id 
        WHERE u.role = 'clinic'
      `).all();
      res.json(clinics);
    } catch (error) {
      console.error("[Server] Error fetching clinics:", error);
      res.status(500).json([]);
    }
  });

  app.get("/api/clinics/:user_id", (req, res) => {
    try {
      const clinic = db.prepare(`
        SELECT u.id, u.name, u.city, cd.degree, cd.reg_no, cd.address, cd.rating, cd.tier, cd.doctor_name, cd.qualification, cd.contact_no, cd.email
        FROM users u
        JOIN clinic_details cd ON u.id = cd.user_id
        WHERE u.id = ?
      `).get(req.params.user_id);
      
      if (clinic) {
        res.json(clinic);
      } else {
        res.status(404).json({ message: "Clinic not found" });
      }
    } catch (error) {
      console.error("[Server] Error fetching clinic detail:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/clinics/:user_id/profile", (req, res) => {
    try {
      const { name, address, doctor_name, qualification, reg_no, contact_no, email } = req.body;
      db.transaction(() => {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, req.params.user_id);
        db.prepare("UPDATE clinic_details SET address = ?, doctor_name = ?, qualification = ?, reg_no = ?, contact_no = ?, email = ? WHERE user_id = ?")
          .run(address, doctor_name, qualification, reg_no, contact_no, email, req.params.user_id);
      })();
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating clinic profile:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // ─── Approval Routes ───────────────────────────────────────────────────────
  app.get("/api/approvals", (req, res) => {
    try {
      const pending = db.prepare(`
        SELECT u.*, 
               hd.address as hospital_address, hd.helpline as hospital_helpline,
               cd.address as clinic_address, cd.contact_no as clinic_contact, cd.doctor_name, cd.qualification
        FROM users u
        LEFT JOIN hospital_details hd ON u.id = hd.user_id
        LEFT JOIN clinic_details cd ON u.id = cd.user_id
        WHERE u.status = 'pending'
      `).all();
      res.json(pending);
    } catch (error) {
      console.error("[Server] Error fetching approvals:", error);
      res.status(500).json([]);
    }
  });

  app.post("/api/approvals/request", (req, res) => {
    const { user_id, name, role } = req.body;
    try {
      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get() as any;
      if (admin) {
        db.prepare("INSERT INTO messages (sender_id, recipient_id, recipient_role, title, content) VALUES (?, ?, ?, ?, ?)")
          .run(user_id, admin.id, 'admin', 'Approval Request', `${role.toUpperCase()} ${name} is requesting dashboard access.`);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error sending request" });
    }
  });

  // ─── Referral Routes ────────────────────────────────────────────────────────
  app.post("/api/referrals", (req, res) => {
    const { patient_name, patient_age, patient_phone, patient_gender, patient_condition, department, diagnosis, note, economical_condition, doctor_id, doctor_name, clinic_id, hospital_id } = req.body;
    const result = db.prepare(`
      INSERT INTO referrals (patient_name, patient_age, patient_phone, patient_gender, patient_condition, department, diagnosis, note, economical_condition, doctor_id, doctor_name, clinic_id, hospital_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(patient_name, patient_age, patient_phone, patient_gender, patient_condition, department, diagnosis, note, economical_condition, doctor_id, doctor_name, clinic_id, hospital_id);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.get("/api/referrals", (req, res) => {
    try {
      const { role, id } = req.query;
      let query = `
        SELECT r.*, u_clinic.name as clinic_name, u_hosp.name as hospital_name, u_hosp.city as hospital_city,
               cd.contact_no as clinic_contact
        FROM referrals r
        JOIN users u_clinic ON r.clinic_id = u_clinic.id
        JOIN users u_hosp ON r.hospital_id = u_hosp.id
        LEFT JOIN clinic_details cd ON r.clinic_id = cd.user_id
      `;
      if (role === 'clinic') {
        query += " WHERE r.clinic_id = ?";
      } else if (role === 'hospital') {
        query += " WHERE r.hospital_id = ?";
      }
      query += " ORDER BY r.created_at DESC";
      
      const referrals = role ? db.prepare(query).all(id) : db.prepare(query).all();
      res.json(referrals);
    } catch (error) {
      console.error("[Server] Error fetching referrals:", error);
      res.status(500).json([]);
    }
  });

  // ─── Message Routes ─────────────────────────────────────────────────────────
  app.post("/api/messages", (req, res) => {
    const { sender_id, recipient_id, recipient_role, title, content } = req.body;
    db.prepare(`
      INSERT INTO messages (sender_id, recipient_id, recipient_role, title, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(sender_id, recipient_id, recipient_role, title, content);
    res.json({ success: true });
  });

  app.get("/api/messages", (req, res) => {
    try {
      const { user_id, role } = req.query;
      const messages = db.prepare(`
        SELECT m.*, u.name as sender_name, u.role as sender_role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.recipient_id = ? OR m.recipient_role = ? OR m.recipient_role = 'all'
        ORDER BY m.created_at DESC
      `).all(user_id, role);
      res.json(messages);
    } catch (error) {
      console.error("[Server] Error fetching messages:", error);
      res.status(500).json([]);
    }
  });

  // ─── User & Admin Routes ───────────────────────────────────────────────────
  app.get("/api/users/:id", (req, res) => {
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
      if (user) {
        res.json(user);
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/users/:id/status", (req, res) => {
    try {
      const { status } = req.body;
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating user status:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/referrals/:id/status", (req, res) => {
    try {
      const { status } = req.body;
      db.prepare("UPDATE referrals SET status = ? WHERE id = ?").run(status, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating referral status:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/hospital_details/:user_id/tier", (req, res) => {
    try {
      const { tier } = req.body;
      db.prepare("UPDATE hospital_details SET tier = ? WHERE user_id = ?").run(tier, req.params.user_id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating hospital tier:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/clinic_details/:user_id/tier", (req, res) => {
    try {
      const { tier } = req.body;
      db.prepare("UPDATE clinic_details SET tier = ? WHERE user_id = ?").run(tier, req.params.user_id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating clinic tier:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/clinic_details/:user_id/rating", (req, res) => {
    try {
      const { rating } = req.body;
      db.prepare("UPDATE clinic_details SET rating = ? WHERE user_id = ?").run(rating, req.params.user_id);
      res.json({ success: true });
    } catch (error) {
      console.error("[Server] Error updating clinic rating:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // ─── Catch-all for API routes ───────────────────────────────────────────────
  app.all("/api/*", (req, res) => {
    log(`[404] API route not found: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, message: "API endpoint not found" });
  });

  // ─── Production: Serve frontend build ───────────────────────────────────────
  const isProd = process.env.NODE_ENV === "production";
  const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
  
  if (isProd && fs.existsSync(frontendDistPath)) {
    log(`[Server] Serving frontend from: ${frontendDistPath}`);
    app.use(express.static(frontendDistPath));
    
    // SPA fallback
    app.get("*", (req, res) => {
      const indexPath = path.join(frontendDistPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend build not found. Run 'npm run build' in the frontend directory.");
      }
    });
  }

  // ─── Error Handler ──────────────────────────────────────────────────────────
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    log(`[Error] ${err.message}\n${err.stack}`);
    res.status(500).send("Internal Server Error");
  });

  // ─── Start ──────────────────────────────────────────────────────────────────
  const server = app.listen(PORT, "0.0.0.0", () => {
    log(`[Server] CareBridge+ Backend listening on port ${PORT}`);
    log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    console.error('[Server] Listen error:', err);
  });
}

startServer().catch(err => {
  log(`[Server] Fatal error during startup: ${err.message}\n${err.stack}`);
});
