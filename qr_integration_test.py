#!/usr/bin/env python3
"""
QR Signature Verification Integration Test
"""

import requests
import json

BACKEND_URL = "https://hce-preview.preview.emergentagent.com/api"

def test_qr_full_integration():
    """Test complete QR generation and resolution flow"""
    print("🧪 Testing QR Generation -> Resolution Integration")
    
    try:
        # Step 1: Generate QR payload for a known charger
        generate_payload = {
            "evse_uid": "NL*CTP*E00001*1",
            "connector_id": "1"
        }
        
        print("📝 Generating QR payload...")
        gen_response = requests.post(
            f"{BACKEND_URL}/admin/qr/generate",
            json=generate_payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if gen_response.status_code != 200:
            print(f"❌ Failed to generate QR: {gen_response.text}")
            return False
        
        gen_data = gen_response.json()
        encoded_payload = gen_data['encoded']
        print(f"✅ Generated payload: {encoded_payload[:50]}...")
        
        # Step 2: Use the generated payload to test resolution
        print("🔍 Testing generated payload resolution...")
        resolve_response = requests.get(
            f"{BACKEND_URL}/v1/qr/resolve",
            params={"payload": encoded_payload},
            timeout=10
        )
        
        if resolve_response.status_code == 200:
            resolve_data = resolve_response.json()
            print("✅ Generated QR payload resolves successfully!")
            print(f"   Charger: {resolve_data['charger']['evse_uid']}")
            print(f"   Station: {resolve_data['station']['name']}")
            print(f"   Cost Estimate: {resolve_data['estimate']['total_display']}")
            return True
        else:
            print(f"❌ Failed to resolve generated QR: {resolve_response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Integration test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_qr_full_integration()
    exit(0 if success else 1)