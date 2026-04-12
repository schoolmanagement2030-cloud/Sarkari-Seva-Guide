import feedparser
import os
from supabase import create_client, Client
from datetime import datetime

# Supabase Credentials (GitHub Secrets से आएंगे)
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

# PIB Hindi RSS Feed URL
PIB_HINDI_RSS = "https://pib.gov.in/RssMain.aspx?ModId=6&LangId=2"

def update_schemes():
    print("Fetching PIB Hindi RSS Feed...")
    feed = feedparser.parse(PIB_HINDI_RSS)
    
    for entry in feed.entries:
        # चेक करें कि क्या यह लिंक पहले से मौजूद है
        existing = supabase.table("schemes").select("id").eq("link", entry.link).execute()
        
        if not existing.data:
            # नई योजना जोड़ें
            data = {
                "title": entry.title,
                "description": entry.summary if hasattr(entry, 'summary') else "",
                "link": entry.link,
                "category": "नई योजनाएं",
                "published_at": datetime.now().isoformat(), # या entry.published से पार्स करें
                "source": "PIB Hindi"
            }
            
            result = supabase.table("schemes").insert(data).execute()
            print(f"Added: {entry.title}")
        else:
            print(f"Skipped (Already exists): {entry.title}")

if __name__ == "__main__":
    if not url or not key:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.")
    else:
        update_schemes()
