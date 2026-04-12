import feedparser
import firebase_admin
from firebase_admin import credentials, firestore
import os
import json

# Firebase Setup
# GitHub Secrets में 'FIREBASE_SERVICE_ACCOUNT' नाम से JSON की डालें
service_account_info = json.loads(os.environ.get("FIREBASE_SERVICE_ACCOUNT"))
cred = credentials.Certificate(service_account_info)
firebase_admin.initialize_app(cred)
db = firestore.client()

# RSS Feeds (Hindi)
FEEDS = [
    {"url": "https://pib.gov.in/RssMain.aspx?ModId=6&LangId=2", "category": "नई योजनाएं"},
    {"url": "https://pib.gov.in/RssMain.aspx?ModId=6&LangId=2", "category": "किसान योजना"}
]

def update_firestore():
    print("Scanning for new schemes...")
    for feed in FEEDS:
        parsed_feed = feedparser.parse(feed["url"])
        for entry in parsed_feed.entries:
            # चेक करें कि क्या लिंक पहले से मौजूद है
            docs = db.collection("schemes").where("link", "==", entry.link).limit(1).get()
            
            if len(docs) == 0:
                data = {
                    "title": entry.title,
                    "description": entry.summary if hasattr(entry, 'summary') else "",
                    "link": entry.link,
                    "category": feed["category"],
                    "publishedAt": entry.published if hasattr(entry, 'published') else datetime.now().isoformat(),
                    "source": "PIB Hindi"
                }
                db.collection("schemes").add(data)
                print(f"Added: {entry.title}")
            else:
                print(f"Skipped: {entry.title}")

if __name__ == "__main__":
    update_firestore()
