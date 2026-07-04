import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";

interface UploadedFileRecord {
  id: string;
  userId: string;
  originalName: string;
  savedName: string;
  fileType: "image" | "audio";
  url: string;
  createdAt: string;
}

interface PrankRecord {
  id: string;
  userId: string;
  name?: string;
  imageUrl: string;
  audioUrl: string;
  imageName: string;
  audioName: string;
  createdAt: string;
  notificationEmail?: string;
  notificationWebhook?: string;
  scansCount?: number;
  scansLog?: Array<{
    timestamp: string;
    action: "scansionato" | "accettato" | "rifiutato";
    userAgent?: string;
    deviceModel?: string;
    locationName?: string;
    ipAddress?: string;
  }>;
  enableFlash?: boolean;
  enableVibration?: boolean;
  enableLoadingBar?: boolean;
  prankType?: "qr" | "article";
  articleTitle?: string;
  articleSubtitle?: string;
  articleSourceName?: string;
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const list = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
    return list[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function parseDeviceModel(userAgent: string): string {
  if (!userAgent) return "Dispositivo Sconosciuto";
  const ua = userAgent.toLowerCase();
  
  if (ua.includes("iphone")) {
    const match = userAgent.match(/iPhone\s+OS\s+([0-9_]+)/i);
    return match ? `iPhone (iOS ${match[1].replace(/_/g, ".")})` : "iPhone";
  }
  if (ua.includes("ipad")) {
    const match = userAgent.match(/CPU\s+OS\s+([0-9_]+)/i);
    return match ? `iPad (iOS ${match[1].replace(/_/g, ".")})` : "iPad";
  }
  if (ua.includes("android")) {
    const parts = userAgent.split("(");
    if (parts.length > 1) {
      const sub = parts[1].split(")")[0];
      const tokens = sub.split(";");
      const androidIdx = tokens.findIndex(t => t.toLowerCase().includes("android"));
      if (androidIdx !== -1 && androidIdx < tokens.length - 1) {
        const modelCandidate = tokens[androidIdx + 1].trim();
        if (!modelCandidate.toLowerCase().includes("build") && !modelCandidate.toLowerCase().includes("lny")) {
          return `Android (${modelCandidate})`;
        }
      }
    }
    const buildMatch = userAgent.match(/\;\s+([^;]+)\s+Build\//i);
    if (buildMatch) return `Android (${buildMatch[1].trim()})`;
    return "Android Device";
  }
  if (ua.includes("macintosh")) return "Mac PC";
  if (ua.includes("windows")) return "Windows PC";
  if (ua.includes("linux")) return "Linux PC";
  return "Browser Desktop";
}

async function getIpLocation(ip: string): Promise<string> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.16.")) {
    return "Roma, Italia (Simulato)";
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`https://freeipapi.com/api/json/${ip}`, { signal: controller.signal });
    clearTimeout(id);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.cityName && data.countryName) {
        return `${data.cityName}, ${data.countryName}`;
      }
    }
  } catch (e) {
    console.error("Errore fetch IP Geolocation (freeipapi):", e);
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`http://ip-api.com/json/${ip}`, { signal: controller.signal });
    clearTimeout(id);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.status === "success" && data.city && data.country) {
        return `${data.city}, ${data.country}`;
      }
    }
  } catch (e) {
    console.error("Errore fallback IP Geolocation (ip-api):", e);
  }

  return "Posizione Sconosciuta";
}

async function sendPrankNotification(
  prank: PrankRecord, 
  action: "scansionato" | "accettato" | "rifiutato", 
  userAgent?: string,
  deviceModel?: string,
  locationName?: string,
  ipAddress?: string
) {
  const { id, imageName, notificationEmail, notificationWebhook } = prank;
  const actionText = action === "scansionato" 
    ? "ha scansionato il QR code ed è entrato nella pagina!" 
    : `ha fatto click su "${action.toUpperCase()}" nel finto banner dei cookie (Scherzo riprodotto!)`;
  
  const timestamp = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const browserInfo = userAgent || "Dispositivo Sconosciuto";
  const devModel = deviceModel || "Dispositivo Sconosciuto";
  const locName = locationName || "Posizione Sconosciuta";
  const ipAddr = ipAddress || "Sconosciuto";

  console.log(`[NOTIFICA] Prank ${id} - Azione: ${action} - UA: ${browserInfo} - IP: ${ipAddr} - Geo: ${locName}`);

  // 1. Send via Webhook (Discord/Custom) if configured
  if (notificationWebhook && notificationWebhook.startsWith("http")) {
    try {
      const isDiscord = notificationWebhook.includes("discord.com/api/webhooks");
      let body = {};

      if (isDiscord) {
        body = {
          embeds: [{
            title: "🎯 Scherzo PrankQR Attivato!",
            description: `Qualcuno **${actionText}**`,
            color: action === "scansionato" ? 16776960 : 16711680, // Yellow for scan, Red for trigger
            fields: [
              { name: "Nome Scherzo", value: imageName || "Senza nome", inline: true },
              { name: "Orario (IT)", value: timestamp, inline: true },
              { name: "Modello Dispositivo", value: devModel, inline: true },
              { name: "Posizione (IP)", value: locName, inline: true },
              { name: "Indirizzo IP", value: ipAddr, inline: true },
              { name: "Dispositivo/Browser", value: browserInfo }
            ],
            footer: { text: "Pescenzo's PrankQR • Divertiti! ;)" }
          }]
        };
      } else {
        body = {
          text: `🎯 [PrankQR] Qualcuno ${actionText} nello scherzo "${imageName}" alle ore ${timestamp} [Modello: ${devModel}, Posizione: ${locName}, IP: ${ipAddr}] utilizzando: ${browserInfo}`
        };
      }

      await fetch(notificationWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log(`Webhook inviato con successo per prank ${id}`);
    } catch (err) {
      console.error("Errore invio webhook:", err);
    }
  }

  // 2. Send via Email if configured
  if (notificationEmail) {
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || `"PrankQR Alerts" <${smtpUser}>`;

      let transporter;

      if (smtpHost && smtpUser && smtpPass) {
        // Use user configured SMTP
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      } else {
        // Fallback: create a test account on ethereal.email (it's completely free and allows viewing emails instantly)
        console.log("Nessun server SMTP configurato. Genero account di test Ethereal...");
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }

      const subject = action === "scansionato"
        ? `👀 QR Scansionato: ${imageName}`
        : `🔥 Scherzo Attivato! (${action}): ${imageName}`;

      const htmlContent = `
        <div style="font-family: sans-serif; padding: 25px; background-color: #0d0d0d; color: #ffffff; border-radius: 12px; max-width: 600px; margin: auto; border: 1px solid #DFFF00; box-shadow: 0 4px 15px rgba(223,255,0,0.15);">
          <h2 style="color: #DFFF00; font-style: italic; font-weight: 900; margin-top: 0; letter-spacing: 1px;">Pescenzo's PrankQR</h2>
          <hr style="border: none; border-top: 1px solid #DFFF00; opacity: 0.2; margin-bottom: 20px;" />
          <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">
            Abbiamo buone notizie! Qualcuno è caduto nella tua trappola di scherzi con QR Code!
          </p>
          <div style="background-color: #141414; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DFFF00;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Azione:</strong> ${actionText}</p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Nome Scherzo:</strong> ${imageName}</p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Orario (IT):</strong> ${timestamp}</p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Modello Dispositivo:</strong> ${devModel}</p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Posizione (IP):</strong> ${locName}</p>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Indirizzo IP:</strong> ${ipAddr}</p>
            <p style="margin: 0; font-size: 13px; color: #a0a0a0;"><strong style="color: #DFFF00;">Dispositivo/Browser:</strong> ${browserInfo}</p>
          </div>
          <p style="font-size: 11px; color: #666; text-align: center; margin-top: 30px; font-family: monospace;">
            Pescenzo's PrankQR • Divertiti responsabilmente! ;)
          </p>
        </div>
      `;

      const info = await transporter.sendMail({
        from: smtpHost ? smtpFrom : `"PrankQR Notification" <noreply@prankqr.com>`,
        to: notificationEmail,
        subject,
        html: htmlContent,
      });

      console.log("Email inviata con successo. ID:", info.messageId);
      if (!smtpHost) {
        console.log("-----------------------------------------");
        console.log("EMAIL DI TEST GENERATA (Ethereal Email):");
        console.log("Clicca sul link sotto per leggerla:");
        console.log(nodemailer.getTestMessageUrl(info));
        console.log("-----------------------------------------");
      }
    } catch (err) {
      console.error("Errore invio email:", err);
    }
  }
}

async function sendPrankTestNotification(
  prank: PrankRecord, 
  action: "scansionato" | "accettato" | "rifiutato", 
  userAgent?: string,
  deviceModel?: string,
  locationName?: string,
  ipAddress?: string
) {
  const { id, imageName, notificationEmail } = prank;
  const timestamp = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const browserInfo = userAgent || "Dispositivo Sconosciuto";
  const devModel = deviceModel || "Dispositivo Sconosciuto";
  const locName = locationName || "Posizione Sconosciuta";
  const ipAddr = ipAddress || "Sconosciuto";

  console.log(`[TEST PREVIEW] Prank ${id} - Azione di test: ${action} - UA: ${browserInfo} - IP: ${ipAddr}`);

  if (notificationEmail) {
    try {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || `"PrankQR Alerts" <${smtpUser}>`;

      let transporter;

      if (smtpHost && smtpUser && smtpPass) {
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      } else {
        console.log("Nessun server SMTP configurato per il test. Genero account di test Ethereal...");
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }

      const subject = action === "scansionato"
        ? `🧪 Test Preview: Il tuo QR Code funziona! (${imageName})`
        : `🔥 Test Scherzo Attivato! (${action}): ${imageName}`;

      let htmlContent = "";

      if (action === "scansionato") {
        htmlContent = `
          <div style="font-family: sans-serif; padding: 25px; background-color: #0d0d0d; color: #ffffff; border-radius: 12px; max-width: 600px; margin: auto; border: 1px solid #DFFF00; box-shadow: 0 4px 15px rgba(223,255,0,0.15);">
            <h2 style="color: #DFFF00; font-style: italic; font-weight: 900; margin-top: 0; letter-spacing: 1px;">Test PrankQR Superato</h2>
            <hr style="border: none; border-top: 1px solid #DFFF00; opacity: 0.2; margin-bottom: 20px;" />
            <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">
              Ciao! Hai appena aperto la <strong>Preview/Test</strong> del tuo QR Code "<strong>${imageName}</strong>".
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #b0b0b0;">
              Questo test conferma che la pagina di reindirizzamento è attiva e il codice QR funziona alla perfezione! Nessuna scansione reale è stata registrata nel tuo pannello di controllo perché si tratta di un test da parte tua.
            </p>
            <div style="background-color: #141414; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DFFF00;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Stato Test:</strong> Funzionamento OK ✅</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Orario Test (IT):</strong> ${timestamp}</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Tuo Dispositivo:</strong> ${devModel}</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Tua Posizione (IP):</strong> ${locName}</p>
            </div>
            <p style="font-size: 11px; color: #666; text-align: center; margin-top: 30px; font-family: monospace;">
              Pescenzo's PrankQR • Generatore di scherzi con QR Code
            </p>
          </div>
        `;
      } else {
        htmlContent = `
          <div style="font-family: sans-serif; padding: 25px; background-color: #0d0d0d; color: #ffffff; border-radius: 12px; max-width: 600px; margin: auto; border: 1px solid #DFFF00; box-shadow: 0 4px 15px rgba(223,255,0,0.15);">
            <h2 style="color: #DFFF00; font-style: italic; font-weight: 900; margin-top: 0; letter-spacing: 1px;">Test Scherzo Attivato</h2>
            <hr style="border: none; border-top: 1px solid #DFFF00; opacity: 0.2; margin-bottom: 20px;" />
            <p style="font-size: 16px; line-height: 1.5; color: #f0f0f0;">
              Durante il tuo test, hai simulato l'interazione premendo su <strong>"${action.toUpperCase()}"</strong> nel finto banner dei cookie del tuo scherzo "<strong>${imageName}</strong>".
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #b0b0b0;">
              Tutti i simulatori di effetti (audio, vibrazione, lag) e la schermata di jumpscare funzionano perfettamente! Anche questa azione di test non è stata conteggiata come una reale scansione di una vittima nel tuo database.
            </p>
            <div style="background-color: #141414; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DFFF00;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Azione Simulata:</strong> ${action === "accettato" ? "ACCETTA COOKIE" : "RIFIUTA COOKIE"}</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Stato Effetti:</strong> Attivati e testati correttamente ✅</p>
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #e0e0e0;"><strong style="color: #DFFF00;">Orario Test (IT):</strong> ${timestamp}</p>
            </div>
            <p style="font-size: 11px; color: #666; text-align: center; margin-top: 30px; font-family: monospace;">
              Pescenzo's PrankQR • Generatore di scherzi con QR Code
            </p>
          </div>
        `;
      }

      const info = await transporter.sendMail({
        from: smtpHost ? smtpFrom : `"PrankQR Notification" <noreply@prankqr.com>`,
        to: notificationEmail,
        subject,
        html: htmlContent,
      });

      console.log("Email di test inviata con successo. ID:", info.messageId);
      if (!smtpHost) {
        console.log("-----------------------------------------");
        console.log("EMAIL DI TEST PREVIEW GENERATA (Ethereal Email):");
        console.log("Clicca sul link sotto per leggerla:");
        console.log(nodemailer.getTestMessageUrl(info));
        console.log("-----------------------------------------");
      }
    } catch (err) {
      console.error("Errore invio email di test:", err);
    }
  }
}

interface FeedbackRecord {
  id: string;
  text: string;
  createdAt: string;
  userId?: string;
}

interface DatabaseSchema {
  files: UploadedFileRecord[];
  pranks: PrankRecord[];
  feedbacks: FeedbackRecord[];
}

const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize simple database
function readDB(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = { files: [], pranks: [], feedbacks: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf-8");
    return initialData;
  }
  try {
    const content = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(content) as DatabaseSchema;
    if (!parsed.feedbacks) {
      parsed.feedbacks = [];
    }
    return parsed;
  } catch (error) {
    console.error("Error reading database file, resetting:", error);
    const initialData: DatabaseSchema = { files: [], pranks: [], feedbacks: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf-8");
    return initialData;
  }
}

function writeDB(data: DatabaseSchema) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Static serving of uploaded files
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Configure Multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const userId = req.headers["x-user-id"] || "anonymous";
      const fileExt = path.extname(file.originalname);
      const uniqueName = `${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
      cb(null, uniqueName);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file limit
    fileFilter: (req, file, cb) => {
      const mime = file.mimetype;
      const fileExt = path.extname(file.originalname).toLowerCase();
      const validAudioVideoExts = [".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".mov", ".webm", ".avi", ".mkv"];
      
      if (
        mime.startsWith("image/") || 
        mime.startsWith("audio/") || 
        mime.startsWith("video/") || 
        validAudioVideoExts.includes(fileExt)
      ) {
        cb(null, true);
      } else {
        cb(new Error("Formato file non supportato. Carica solo immagini, file audio o video."));
      }
    },
  });

  // --- API ROUTES ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Upload file (Image or Audio)
  app.post("/api/upload", (req, res, next) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }
    next();
  }, upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nessun file caricato" });
        return;
      }

      const userId = req.headers["x-user-id"] as string;
      const fileType = req.file.mimetype.startsWith("image/") ? "image" : "audio";
      const db = readDB();

      const newFile: UploadedFileRecord = {
        id: `file-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        userId,
        originalName: req.file.originalname,
        savedName: req.file.filename,
        fileType,
        url: `/uploads/${req.file.filename}`,
        createdAt: new Date().toISOString(),
      };

      db.files.push(newFile);
      writeDB(db);

      res.status(201).json(newFile);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Errore durante il caricamento del file" });
    }
  });

  // Get user's uploaded files
  app.get("/api/files", (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }

    const db = readDB();
    const userFiles = db.files.filter((f) => f.userId === userId);
    res.json(userFiles);
  });

  // Delete user's uploaded file
  app.delete("/api/files/:id", (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    const fileId = req.params.id;

    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }

    const db = readDB();
    const fileIndex = db.files.findIndex((f) => f.id === fileId && f.userId === userId);

    if (fileIndex === -1) {
      res.status(404).json({ error: "File non trovato o non autorizzato" });
      return;
    }

    const fileRecord = db.files[fileIndex];
    const filePath = path.join(UPLOADS_DIR, fileRecord.savedName);

    // Delete file from disk
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("Errore eliminazione file da disco:", err);
      }
    }

    // Remove from db
    db.files.splice(fileIndex, 1);
    writeDB(db);

    res.json({ success: true, message: "File eliminato con successo" });
  });

  // Create a new prank setup
  app.post("/api/pranks", (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    const { 
      name,
      imageUrl, 
      audioUrl, 
      imageName, 
      audioName, 
      notificationEmail, 
      notificationWebhook,
      enableFlash,
      enableVibration,
      enableLoadingBar,
      prankType,
      articleTitle,
      articleSubtitle,
      articleSourceName
    } = req.body;

    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }

    if (!imageUrl || !audioUrl) {
      res.status(400).json({ error: "Dati immagine e audio richiesti" });
      return;
    }

    const db = readDB();
    const prankId = `prank-${Date.now()}-${Math.round(Math.random() * 10000)}`;

    const newPrank: PrankRecord = {
      id: prankId,
      userId,
      name: name || undefined,
      imageUrl,
      audioUrl,
      imageName: imageName || "Immagine dello scherzo",
      audioName: audioName || "Audio dello scherzo",
      createdAt: new Date().toISOString(),
      notificationEmail: notificationEmail || undefined,
      notificationWebhook: notificationWebhook || undefined,
      scansCount: 0,
      scansLog: [],
      enableFlash: !!enableFlash,
      enableVibration: !!enableVibration,
      enableLoadingBar: !!enableLoadingBar,
      prankType: prankType || "qr",
      articleTitle: articleTitle || undefined,
      articleSubtitle: articleSubtitle || undefined,
      articleSourceName: articleSourceName || undefined
    };

    db.pranks.push(newPrank);
    writeDB(db);

    res.status(201).json(newPrank);
  });

  // Get user's active pranks
  app.get("/api/pranks", (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }

    const db = readDB();
    const userPranks = db.pranks.filter((p) => p.userId === userId);
    res.json(userPranks);
  });

  // Delete a prank
  app.delete("/api/pranks/:id", (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    const prankId = req.params.id;

    if (!userId) {
      res.status(400).json({ error: "Intestazione x-user-id mancante" });
      return;
    }

    const db = readDB();
    const prankIndex = db.pranks.findIndex((p) => p.id === prankId && p.userId === userId);

    if (prankIndex === -1) {
      res.status(404).json({ error: "Scherzo non trovato o non autorizzato" });
      return;
    }

    db.pranks.splice(prankIndex, 1);
    writeDB(db);

    res.json({ success: true, message: "Scherzo eliminato con successo" });
  });

  // Get public prank configuration & log scan (used by victim page)
  app.get("/api/public-pranks/:id", async (req, res) => {
    const prankId = req.params.id;
    const isPreview = req.query.preview === "true";
    const db = readDB();
    const prankIndex = db.pranks.findIndex((p) => p.id === prankId);

    if (prankIndex === -1) {
      res.status(404).json({ error: "Questo scherzo non esiste o è scaduto!" });
      return;
    }

    const prank = db.pranks[prankIndex];
    const userAgent = req.headers["user-agent"] || "Dispositivo Sconosciuto";
    const ipAddress = getClientIp(req);
    const deviceModel = parseDeviceModel(userAgent);
    
    // Resolve location
    const locationName = await getIpLocation(ipAddress);

    if (isPreview) {
      // Creator preview - DO NOT log scan, send test notification if email is configured
      if (prank.notificationEmail) {
        sendPrankTestNotification(prank, "scansionato", userAgent, deviceModel, locationName, ipAddress).catch((err) => {
          console.error("Errore notifica test scan asincrona:", err);
        });
      }
    } else {
      // Real victim scan - increment scans count & log scan
      prank.scansCount = (prank.scansCount || 0) + 1;
      if (!prank.scansLog) {
        prank.scansLog = [];
      }
      prank.scansLog.push({
        timestamp: new Date().toISOString(),
        action: "scansionato",
        userAgent,
        deviceModel,
        locationName,
        ipAddress,
      });
      
      db.pranks[prankIndex] = prank;
      writeDB(db);

      // Send asynchronous scan notification
      sendPrankNotification(prank, "scansionato", userAgent, deviceModel, locationName, ipAddress).catch((err) => {
        console.error("Errore notifica scan asincrona:", err);
      });
    }

    res.json({
      imageUrl: prank.imageUrl,
      audioUrl: prank.audioUrl,
      enableFlash: prank.enableFlash,
      enableVibration: prank.enableVibration,
      enableLoadingBar: prank.enableLoadingBar,
      prankType: prank.prankType || "qr",
      articleTitle: prank.articleTitle,
      articleSubtitle: prank.articleSubtitle,
      articleSourceName: prank.articleSourceName,
    });
  });

  // Track user interaction action (accettato / rifiutato cookie)
  app.post("/api/public-pranks/:id/action", async (req, res) => {
    const prankId = req.params.id;
    const { action } = req.body;
    const isPreview = req.query.preview === "true";

    if (action !== "accettato" && action !== "rifiutato") {
      res.status(400).json({ error: "Azione non valida" });
      return;
    }

    const db = readDB();
    const prankIndex = db.pranks.findIndex((p) => p.id === prankId);

    if (prankIndex === -1) {
      res.status(404).json({ error: "Scherzo non trovato" });
      return;
    }

    const prank = db.pranks[prankIndex];
    const userAgent = req.headers["user-agent"] || "Dispositivo Sconosciuto";
    const ipAddress = getClientIp(req);
    const deviceModel = parseDeviceModel(userAgent);
    
    const locationName = await getIpLocation(ipAddress);

    if (isPreview) {
      // Creator preview - DO NOT log action, send test notification if email is configured
      if (prank.notificationEmail) {
        sendPrankTestNotification(prank, action, userAgent, deviceModel, locationName, ipAddress).catch((err) => {
          console.error("Errore notifica test azione asincrona:", err);
        });
      }
    } else {
      // Real victim action - log action
      if (!prank.scansLog) {
        prank.scansLog = [];
      }
      prank.scansLog.push({
        timestamp: new Date().toISOString(),
        action,
        userAgent,
        deviceModel,
        locationName,
        ipAddress,
      });

      db.pranks[prankIndex] = prank;
      writeDB(db);

      // Send asynchronous action notification
      sendPrankNotification(prank, action, userAgent, deviceModel, locationName, ipAddress).catch((err) => {
        console.error("Errore notifica azione asincrona:", err);
      });
    }

    res.json({ success: true });
  });

  // --- TELEPHONE CALL PRANK (Twilio Integration) ---
  app.all("/api/twiml", (req, res) => {
    const audio = req.query.audio as string || req.body.audio as string;
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audio}</Play>
</Response>`);
  });

  app.post("/api/make-call", async (req, res) => {
    const { toPhone, audioUrl, clientOrigin } = req.body;

    if (!toPhone) {
      res.status(400).json({ error: "Numero di telefono del destinatario richiesto" });
      return;
    }
    if (!audioUrl) {
      res.status(400).json({ error: "Seleziona un file audio per la chiamata" });
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const rawFromPhone = process.env.TWILIO_PHONE_NUMBER;

    let cleanToPhone = toPhone.trim().replace(/[\s\-\(\)]/g, "");
    if (!cleanToPhone.startsWith("+")) {
      // Auto-prepend +39 if it's an Italian mobile number (starts with 3 and is 10 digits)
      if (/^3\d{9}$/.test(cleanToPhone)) {
        cleanToPhone = `+39${cleanToPhone}`;
      }
    }

    let cleanFromPhone = (rawFromPhone || "").trim().replace(/[\s\-\(\)]/g, "");
    if (cleanFromPhone && !cleanFromPhone.startsWith("+")) {
      cleanFromPhone = `+${cleanFromPhone}`;
    }

    // If Twilio config is incomplete, let's support a realistic "Simulation Mode"
    // so the user can test the interface, and instruct them how to make it real.
    if (!accountSid || !authToken || !cleanFromPhone) {
      console.log(`[SIMULAZIONE CHIAMATA] Numero: ${cleanToPhone} | Audio: ${audioUrl}`);
      res.json({
        success: true,
        isSimulation: true,
        message: "Chiamata simulata con successo! Per fare chiamate reali sul telefono di un amico, configura le credenziali Twilio nelle impostazioni dell'app (Twilio SID, Auth Token e Numero Twilio).",
      });
      return;
    }

    try {
      let baseOrigin = clientOrigin || "";
      if (!baseOrigin) {
        const host = req.get("host") || "";
        const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
        baseOrigin = `${protocol}://${host}`;
      }

      // Helper function to rewrite localhost/internal URLs to the true public baseOrigin
      const makeUrlPublic = (urlStr: string): string => {
        if (!urlStr) return "";
        if (urlStr.startsWith("/")) {
          return `${baseOrigin}${urlStr}`;
        }
        // If it contains localhost or 127.0.0.1, replace the origin part with baseOrigin
        if (urlStr.includes("localhost") || urlStr.includes("127.0.0.1")) {
          try {
            const parsed = new URL(urlStr);
            return `${baseOrigin}${parsed.pathname}${parsed.search}`;
          } catch (e) {
            return urlStr.replace(/https?:\/\/[^\/]+/, baseOrigin);
          }
        }
        return urlStr;
      };

      const absoluteAudioUrl = makeUrlPublic(audioUrl);
      const twimlUrl = `${baseOrigin}/api/twiml?audio=${encodeURIComponent(absoluteAudioUrl)}`;

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const params = new URLSearchParams();
      params.append("To", cleanToPhone);
      params.append("From", cleanFromPhone);
      params.append("Url", twimlUrl);

      const twilioResponse = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      const responseData: any = await twilioResponse.json();

      if (!twilioResponse.ok) {
        throw new Error(responseData.message || "Errore sconosciuto da Twilio");
      }

      console.log(`[CHIAMATA TWILIO REALE] Chiamata avviata con successo! SID: ${responseData.sid}`);
      res.json({
        success: true,
        isSimulation: false,
        message: `Chiamata inoltrata con successo al numero ${toPhone}!`,
        callSid: responseData.sid,
      });
    } catch (err: any) {
      console.error("Errore durante l'avvio della chiamata Twilio:", err);
      res.status(500).json({ error: `Errore Twilio: ${err.message || err}` });
    }
  });

  // Submit feedback
  app.post("/api/feedback", (req, res) => {
    const { text, userId } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Il testo del consiglio o dell'idea è richiesto" });
      return;
    }

    const db = readDB();
    if (!db.feedbacks) {
      db.feedbacks = [];
    }

    const newFeedback: FeedbackRecord = {
      id: `fb-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      userId: userId || undefined,
    };

    db.feedbacks.push(newFeedback);
    writeDB(db);

    console.log(`[CONSIGLIO] Nuovo consiglio ricevuto: "${newFeedback.text}"`);

    res.json({ success: true, feedback: newFeedback });
  });

  // Delete a specific feedback
  app.delete("/api/feedback/:id", (req, res) => {
    const feedbackId = req.params.id;
    const userId = req.headers["x-user-id"] as string;
    const adminSecret = req.headers["x-admin-secret"] as string;

    const db = readDB();
    if (!db.feedbacks) {
      db.feedbacks = [];
    }

    const index = db.feedbacks.findIndex((f) => f.id === feedbackId);
    if (index === -1) {
      res.status(404).json({ error: "Consiglio non trovato" });
      return;
    }

    const feedback = db.feedbacks[index];
    const isOwner = feedback.userId === userId;
    const isAdmin = adminSecret === "Agnese1982Tony";

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Non sei autorizzato ad eliminare questo consiglio" });
      return;
    }

    db.feedbacks.splice(index, 1);
    writeDB(db);

    console.log(`[CONSIGLIO] Consiglio eliminato: ${feedbackId} (da ${isAdmin ? "Admin" : "Owner"})`);
    res.json({ success: true });
  });

  // Get all feedbacks (for creator view)
  app.get("/api/feedbacks", (req, res) => {
    const db = readDB();
    res.json(db.feedbacks || []);
  });

  // Global error handler for multer
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Il file è troppo grande! Dimensione massima consentita: 15MB." });
        return;
      }
      res.status(400).json({ error: `Errore caricamento: ${err.message}` });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
