
import os
import requests
from dotenv import load_dotenv

load_dotenv()

def probe_replicate():
    api_key = os.getenv('REPLICATE_API_KEY')
    if not api_key:
        print("❌ REPLICATE_API_KEY not found in .env.local")
        return

    print(f"🔍 Probing Replicate for black-forest-labs/flux-schnell versions...")
    
    headers = {
        'Authorization': f'Token {api_key}',
        'Content-Type': 'application/json'
    }
    
    try:
        # Try to get the model details which includes the latest version
        response = requests.get(
            'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell',
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            latest_version = data.get('latest_version', {}).get('id')
            print(f"✅ Found latest version: {latest_version}")
            return latest_version
        else:
            print(f"❌ Failed to get model details: {response.status_code} - {response.text}")
            
            # Fallback: List versions
            print("🔍 Attempting to list versions instead...")
            versions_resp = requests.get(
                'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/versions',
                headers=headers
            )
            if versions_resp.status_code == 200:
                v_data = versions_resp.json()
                if v_data.get('results'):
                    latest = v_data['results'][0]['id']
                    print(f"✅ Found latest version via list: {latest}")
                    return latest
            else:
                print(f"❌ Failed to list versions: {versions_resp.status_code} - {versions_resp.text}")
    except Exception as e:
        print(f"❌ Probe error: {str(e)}")
    return None

if __name__ == "__main__":
    probe_replicate()
