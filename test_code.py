from supabase import create_client
from postgrest.exceptions import APIError
import json
import uuid

with open('config.public.json') as f:
    public = json.load(f)

# Connect with the ANON key (not service key!)
client = create_client(public['SUPABASE_URL'], public['SUPABASE_ANON_KEY'])

# This works — page_views has a public SELECT policy
result = client.table('page_views').select('*').limit(5).execute()
print(f"page_views: {len(result.data)} rows ✅")
client.table('page_views').insert({
    "page_url": "https://example.com",
    "user_agent": "RLS test"
}).execute()

# This returns nothing — sentence_embeddings requires authentication
result = client.table('sentence_embeddings').select('*').limit(5).execute()
print(f"sentence_embeddings: {len(result.data)} rows (expected: 0) 🔒")
try:
    client.table('sentence_embeddings').insert({
        "talk_id": str(uuid.uuid4()),
        "title": "Test Title",
        "speaker": "Test Speaker",
        "text": "Test text"
    }).execute()
except APIError as exc:
    print(f"sentence_embeddings insert rejected for anon client: {exc}")
else:
    raise RuntimeError("Anon insert unexpectedly succeeded on sentence_embeddings")
