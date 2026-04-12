import fetch from 'node-fetch';

async function sync() {
  console.log("Triggering sync...");
  try {
    const res = await fetch('http://localhost:3000/api/sync');
    const data = await res.json();
    console.log("Sync Result:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Sync Failed:", err);
  }
}

sync();
