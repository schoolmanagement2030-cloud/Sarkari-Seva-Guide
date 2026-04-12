import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();
const logs = await db.collection("logs").orderBy("timestamp", "desc").limit(10).get();
console.log("RECENT LOGS:");
logs.forEach(doc => {
  console.log(JSON.stringify(doc.data(), null, 2));
});
process.exit(0);
