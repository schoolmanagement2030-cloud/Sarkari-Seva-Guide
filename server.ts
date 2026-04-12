import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Parser from "rss-parser";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import crypto from "crypto";
import axios from "axios";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import { analyzeAndExtract } from "./src/lib/gemini.ts";

const parser = new Parser();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

const app = express();
app.use(express.json());

// Extend Request type for admin
interface AdminRequest extends express.Request {
  user?: any;
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
// app.use("/api/", limiter);

// RSS Feed URLs
const FEEDS = [
  { name: "PIB Hindi", url: "https://pib.gov.in/RssMain.aspx?ModId=6&LangId=2" },
  { name: "PIB English", url: "https://pib.gov.in/RssMain.aspx?ModId=6&LangId=1" },
  { name: "Govt Schemes News", url: "https://news.google.com/rss/search?q=Latest+Government+Schemes+India+2026&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Govt Jobs India", url: "https://news.google.com/rss/search?q=Latest+Government+Jobs+India+2026+Sarkari+Naukri&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Private Jobs India", url: "https://news.google.com/rss/search?q=Private+Jobs+India+2026+Freshers&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Scholarships", url: "https://news.google.com/rss/search?q=Scholarships+for+Indian+Students+2026&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Employment News", url: "https://news.google.com/rss/search?q=Employment+News+India+Sarkari+Result&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "UP Schemes", url: "https://news.google.com/rss/search?q=Uttar+Pradesh+Government+Schemes+2026&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Bihar Schemes", url: "https://news.google.com/rss/search?q=Bihar+Government+Schemes+2026&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "MP Schemes", url: "https://news.google.com/rss/search?q=Madhya+Pradesh+Government+Schemes+2026&hl=hi&gl=IN&ceid=IN:hi" },
  { name: "Rajasthan Schemes", url: "https://news.google.com/rss/search?q=Rajasthan+Government+Schemes+2026&hl=hi&gl=IN&ceid=IN:hi" }
];

function generateDocId(link: string) {
  return crypto.createHash('md5').update(link).digest('hex');
}

export async function fetchAndSyncData() {
  console.log(`[${new Date().toISOString()}] AI Agent: Starting Autonomous Data Pipeline...`);
  let addedCount = 0;
  let rejectedCount = 0;

  for (const feedSource of FEEDS) {
    try {
      console.log(`Fetching feed: ${feedSource.name}`);
      const response = await axios.get(feedSource.url, { timeout: 15000 });
      const feed = await parser.parseString(response.data);
      
      // Process top 15 items from each feed to ensure enough data
      for (const item of (feed.items || []).slice(0, 15)) {
        const link = item.link || "";
        if (!link) continue;

        const docId = generateDocId(link);
        
        // Check if already exists
        const schemeCheck = await db.collection("schemes").doc(docId).get();
        const jobCheck = await db.collection("jobs").doc(docId).get();
        
        if (schemeCheck.exists || jobCheck.exists) {
          // console.log(`Skipping duplicate: ${item.title}`);
          continue;
        }

        console.log(`Analyzing: ${item.title}`);
        const aiResult = await analyzeAndExtract(item.title || "", item.contentSnippet || item.content || "", feedSource.name);

        if (!aiResult) {
          console.error(`AI Analysis failed for: ${item.title}`);
          continue;
        }

        // Autonomous Verification Logic
        const isVerified = 
          aiResult.isTrustworthy && 
          aiResult.confidence >= 80 && 
          !aiResult.isClickbait && 
          !aiResult.isExpired;

        if (isVerified) {
          const collectionName = aiResult.type === "Job" ? "jobs" : "schemes";
          
          // Generate a relevant image URL
          const keywords = aiResult.imageKeywords || (aiResult.type === "Job" ? "job office" : "government india");
          const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(keywords.split(' ')[0])}/800/600`;

          const finalData = {
            id: docId,
            title: aiResult.hindiTitle || item.title,
            description: aiResult.hindiDescription || item.contentSnippet || item.content || "",
            link,
            image: imageUrl,
            source: feedSource.name,
            publishedAt: new Date().toISOString(),
            category: aiResult.category || (aiResult.type === "Job" ? "Jobs" : "Central"),
            state: aiResult.state || "All India",
            type: aiResult.type,
            jobType: aiResult.jobType || null,
            isAI: true,
            isAIProcessed: true,
            status: "approved",
            verifiedBy: "AI-Autonomous-Agent",
            aiReasoning: aiResult.reasoning
          };

          await db.collection(collectionName).doc(docId).set(finalData);
          
          // Log addition
          await db.collection("logs").add({
            action: "AUTO_PUBLISH",
            type: aiResult.type,
            title: finalData.title,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            confidence: aiResult.confidence
          });

          console.log(`✅ Auto-Published: ${finalData.title}`);
          addedCount++;
        } else {
          // Log rejection
          await db.collection("logs").add({
            action: "AUTO_REJECT",
            title: item.title,
            reason: aiResult.reasoning,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isClickbait: aiResult.isClickbait,
            isExpired: aiResult.isExpired,
            trustworthy: aiResult.isTrustworthy
          });
          console.log(`❌ Auto-Rejected: ${item.title} - Reason: ${aiResult.reasoning}`);
          rejectedCount++;
        }
      }
    } catch (err) {
      console.error(`Error fetching feed ${feedSource.name}:`, err);
    }
  }
  console.log(`[${new Date().toISOString()}] Pipeline Finished. Added: ${addedCount}, Rejected: ${rejectedCount}`);
  return addedCount;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/data", async (req, res) => {
  try {
    const schemes = await db.collection("schemes").orderBy("publishedAt", "desc").limit(50).get();
    const jobs = await db.collection("jobs").orderBy("publishedAt", "desc").limit(50).get();
    
    res.json({
      schemes: schemes.docs.map(d => ({ id: d.id, ...d.data() })),
      jobs: jobs.docs.map(d => ({ id: d.id, ...d.data() }))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Admin Authentication Middleware
async function checkAdmin(req: AdminRequest, res: any, next: any) {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    if (decodedToken.admin || decodedToken.email === "vinas23metro2@gmail.com") {
      req.user = decodedToken;
      next();
    } else {
      res.status(403).json({ error: "Forbidden: Admin access required" });
    }
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/admin/pending", checkAdmin, async (req: AdminRequest, res) => {
  try {
    const pending = await db.collection("pending_content").where("status", "==", "pending").get();
    const raw = await db.collection("pending_content").where("status", "==", "raw").get();
    res.json([...pending.docs.map(d => d.data()), ...raw.docs.map(d => d.data())]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pending content" });
  }
});

app.post("/api/admin/update-pending", checkAdmin, async (req: AdminRequest, res) => {
  const { id, updates } = req.body;
  try {
    await db.collection("pending_content").doc(id).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update pending content" });
  }
});

app.post("/api/admin/approve", checkAdmin, async (req: AdminRequest, res) => {
  const { id } = req.body;
  try {
    const docRef = db.collection("pending_content").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });

    const data = doc.data()!;
    const collectionName = data.type === "Job" ? "jobs" : "schemes";
    
    await db.collection(collectionName).doc(id).set({
      ...data,
      status: "approved",
      approvedBy: req.user.email,
      approvedAt: new Date().toISOString()
    });
    
    await docRef.delete();
    
    // Log action
    await db.collection("logs").add({
      action: "APPROVE",
      adminEmail: req.user.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: `Approved ${data.type}: ${data.title}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve" });
  }
});

app.post("/api/admin/reject", checkAdmin, async (req: AdminRequest, res) => {
  const { id } = req.body;
  try {
    const docRef = db.collection("pending_content").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });

    const data = doc.data()!;
    await docRef.update({ status: "rejected", rejectedBy: req.user.email });
    
    // Log action
    await db.collection("logs").add({
      action: "REJECT",
      adminEmail: req.user.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: `Rejected ${data.type}: ${data.title}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject" });
  }
});

app.post("/api/sync", checkAdmin, async (req: AdminRequest, res) => {
  try {
    const added = await fetchAndSyncData();
    res.json({ success: true, added });
  } catch (err) {
    res.status(500).json({ error: "Sync failed" });
  }
});

// Public force-sync for immediate execution (Temporary/Emergency)
app.get("/api/force-sync", async (req, res) => {
  try {
    console.log("!!! EMERGENCY FORCE SYNC TRIGGERED !!!");
    const added = await fetchAndSyncData();
    res.json({ success: true, message: "Force sync complete", added });
  } catch (err) {
    res.status(500).json({ error: "Force sync failed" });
  }
});

// Set Admin Claim (One-time use or restricted)
app.post("/api/admin/set-claim", async (req, res) => {
  const { email, secret } = req.body;
  // In production, use a more secure way to verify this request
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Invalid secret" });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    res.json({ success: true, message: `Admin claim set for ${email}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to set admin claim" });
  }
});

async function startServer() {
  try {
    const PORT = 3000;

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
      console.log(`Server running on http://localhost:${PORT}`);
      
      // Initial sync
      fetchAndSyncData().catch(console.error);
      // Periodic sync every 30 minutes
      setInterval(() => fetchAndSyncData().catch(console.error), 30 * 60 * 1000);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
