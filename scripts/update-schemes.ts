import Parser from 'rss-parser';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Note: In a real GitHub Action, you'd use environment variables for the config
// For this environment, we'll assume the config is available or passed via env
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);
const parser = new Parser();

const FEEDS = [
  { url: 'https://pib.gov.in/RssMain.aspx?ModId=6&LangId=1', category: 'General' }, // PIB English (for demo, can find Hindi feeds)
  // Add more feeds here
];

async function updateSchemes() {
  for (const feed of FEEDS) {
    try {
      const feedData = await parser.parseURL(feed.url);
      console.log(`Processing feed: ${feedData.title}`);

      for (const item of feedData.items) {
        const q = query(collection(db, 'schemes'), where('link', '==', item.link));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          await addDoc(collection(db, 'schemes'), {
            title: item.title,
            description: item.contentSnippet || item.content || '',
            link: item.link,
            category: feed.category,
            publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            source: 'PIB'
          });
          console.log(`Added: ${item.title}`);
        }
      }
    } catch (error) {
      console.error(`Error processing feed ${feed.url}:`, error);
    }
  }
}

updateSchemes().then(() => console.log('Update complete')).catch(console.error);
