#!/usr/bin/env python3

import requests
import json
import base64
import time
import sys
from typing import Dict, Any, Optional

# Test configuration - Using the external URL from frontend/.env
BASE_URL = "https://hce-preview.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "chargetap2025"

# OCPI CPO Token for testing
CPO_TOKEN = "test-cpo-token-12345"

class RFIDTokenTester:
    def __init__(self):
        self.admin_auth = base64.b64encode(f"{ADMIN_USERNAME}:{ADMIN_PASSWORD}".encode()).decode()
        self.created_token_id = None
        self.test_uid = "04F7A8B9CADBEC"
        
    def log(self, message: str, success: bool = True):
        status = "✅" if success else "❌"
        print(f"{status} {message}")
        
    def log_error(self, message: str, response: Optional[requests.Response] = None):
        print(f"❌ ERROR: {message}")
        if response:
            print(f"   Status: {response.status_code}")
            try:
                print(f"   Response: {json.dumps(response.json(), indent=2)}")
            except:
                print(f"   Response: {response.text}")
                
    def make_admin_request(self, method: str, endpoint: str, data: Dict = None, expect_status: int = 200) -> Dict[str, Any]:
        """Make HTTP request with Basic Auth for admin endpoints"""
        url = f"{BASE_URL}{endpoint}"
        headers = HEADERS.copy()
        headers["Authorization"] = f"Basic {self.admin_auth}"
            
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            elif method == "PATCH":
                response = requests.patch(url, headers=headers, json=data, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code != expect_status:
                self.log_error(f"Unexpected status code for {method} {endpoint}", response)
                return {"error": True, "status": response.status_code}
                
            return response.json()
            
        except requests.exceptions.RequestException as e:
            self.log_error(f"Request failed for {method} {endpoint}: {str(e)}")
            return {"error": True, "message": str(e)}

    def make_ocpi_request(self, method: str, endpoint: str, data: Dict = None, expect_status: int = 200) -> Dict[str, Any]:
        """Make HTTP request with Token Auth for OCPI endpoints"""
        url = f"{BASE_URL}{endpoint}"
        headers = HEADERS.copy()
        headers["Authorization"] = f"Token {CPO_TOKEN}"
            
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code != expect_status:
                self.log_error(f"Unexpected status code for {method} {endpoint}", response)
                return {"error": True, "status": response.status_code, "response": response.text}
                
            return response.json()
            
        except requests.exceptions.RequestException as e:
            self.log_error(f"Request failed for {method} {endpoint}: {str(e)}")
            return {"error": True, "message": str(e)}

    def test_backend_health(self) -> bool:
        """Test if backend is responding"""
        print("\n🔍 Testing Backend Health...")
        
        try:
            response = requests.get(f"{BASE_URL}/", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.log(f"Backend running: {data.get('message', 'Unknown')} v{data.get('version', '?')} ({data.get('stack', 'Unknown stack')})")
                return True
            else:
                self.log_error("Backend health check failed", response)
                return False
        except Exception as e:
            self.log_error(f"Backend health check failed: {str(e)}")
            return False

    def test_create_rfid_token(self) -> bool:
        """Test POST /api/admin/tokens - Create RFID token"""
        print("\n🏷️  Test 1: Creating RFID Token...")
        
        data = {
            "uid": self.test_uid,
            "whitelist": "ALWAYS"
        }
        
        result = self.make_admin_request("POST", "/admin/tokens", data, 200)
        
        if result.get("error"):
            # Check if it's a duplicate error (409)
            if result.get("status") == 409:
                self.log("Token already exists, that's expected for testing")
                # Try to find the existing token ID
                existing_token_id = result.get("existing_token_id")
                if existing_token_id:
                    self.created_token_id = existing_token_id
                    self.log(f"Using existing token ID: {self.created_token_id}")
                return True
            return False
            
        if "id" in result and "uid" in result and "contract_id" in result:
            self.created_token_id = result["id"]
            self.log(f"RFID token created successfully:")
            self.log(f"  ID: {result['id']}")
            self.log(f"  UID: {result['uid']}")
            self.log(f"  Contract ID: {result['contract_id']}")
            self.log(f"  Status: {result['status']}")
            self.log(f"  Whitelist: {result['whitelist']}")
            return True
        else:
            self.log_error("Create token response missing required fields")
            return False

    def test_list_all_tokens(self) -> bool:
        """Test GET /api/admin/tokens - List all tokens"""
        print("\n📋 Test 2: Listing All Tokens...")
        
        result = self.make_admin_request("GET", "/admin/tokens", None, 200)
        
        if result.get("error"):
            return False
            
        if "tokens" in result and "total" in result:
            tokens = result["tokens"]
            total = result["total"]
            self.log(f"Found {total} tokens in system")
            
            if len(tokens) > 0:
                # Show details of first few tokens
                for i, token in enumerate(tokens[:3]):
                    self.log(f"  Token {i+1}: UID={token.get('uid', 'N/A')}, Status={token.get('status', 'N/A')}, Contract={token.get('contract_id', 'N/A')}")
                    
            # Check if our test token is in the list
            test_token = next((t for t in tokens if t.get('uid') == self.test_uid), None)
            if test_token:
                self.log(f"Found our test token in the list: {test_token['contract_id']}")
                if not self.created_token_id:
                    self.created_token_id = test_token['id']
                    
            return True
        else:
            self.log_error("List tokens response missing required fields")
            return False

    def test_get_token_details(self) -> bool:
        """Test GET /api/admin/tokens/:id - Get token details"""
        print("\n🔍 Test 3: Getting Token Details...")
        
        if not self.created_token_id:
            self.log_error("No token ID available for testing")
            return False
            
        result = self.make_admin_request("GET", f"/admin/tokens/{self.created_token_id}", None, 200)
        
        if result.get("error"):
            return False
            
        if "id" in result and "uid" in result:
            self.log(f"Token details retrieved successfully:")
            self.log(f"  ID: {result.get('id')}")
            self.log(f"  UID: {result.get('uid')}")
            self.log(f"  Contract ID: {result.get('contract_id')}")
            self.log(f"  Status: {result.get('status')}")
            self.log(f"  Type: {result.get('type')}")
            self.log(f"  Whitelist: {result.get('whitelist')}")
            self.log(f"  Usage Count: {result.get('usage_count', 0)}")
            
            # Check if audit logs are included
            audit_logs = result.get('audit_logs', [])
            if audit_logs:
                self.log(f"  Has {len(audit_logs)} audit log entries")
                
            return True
        else:
            self.log_error("Token details response missing required fields")
            return False

    def test_block_token(self) -> bool:
        """Test PATCH /api/admin/tokens/:id - Block token"""
        print("\n🚫 Test 4: Blocking Token...")
        
        if not self.created_token_id:
            self.log_error("No token ID available for testing")
            return False
            
        data = {
            "status": "BLOCKED",
            "reason": "Testing block functionality"
        }
        
        result = self.make_admin_request("PATCH", f"/admin/tokens/{self.created_token_id}", data, 200)
        
        if result.get("error"):
            return False
            
        if "id" in result and result.get("status") == "BLOCKED":
            self.log(f"Token blocked successfully:")
            self.log(f"  ID: {result['id']}")
            self.log(f"  Status: {result['status']}")
            self.log(f"  Last Updated: {result.get('last_updated')}")
            return True
        else:
            self.log_error("Block token response invalid")
            return False

    def test_get_token_stats(self) -> bool:
        """Test GET /api/admin/tokens/stats - Get statistics"""
        print("\n📊 Test 5: Getting Token Statistics...")
        
        result = self.make_admin_request("GET", "/admin/tokens/stats", None, 200)
        
        if result.get("error"):
            return False
            
        if "total_tokens" in result:
            self.log(f"Token statistics retrieved successfully:")
            self.log(f"  Total Tokens: {result.get('total_tokens', 0)}")
            
            by_status = result.get('by_status', {})
            if by_status:
                self.log(f"  By Status: {by_status}")
                
            by_type = result.get('by_type', {})
            if by_type:
                self.log(f"  By Type: {by_type}")
                
            auth_24h = result.get('authorizations_24h', {})
            if auth_24h:
                self.log(f"  Authorizations (24h): {auth_24h}")
                
            return True
        else:
            self.log_error("Token stats response missing required fields")
            return False

    def test_import_tokens_csv(self) -> bool:
        """Test POST /api/admin/tokens/import - Import CSV"""
        print("\n📥 Test 6: Importing Tokens from CSV...")
        
        # Create test CSV data
        csv_data = "rfid_uid,user_email,visual_number\n04A2B3C4D5E6F7,test@example.com,**** E6F7\n04B3C4D5E6F8A9,,**** F8A9"
        
        data = {
            "csv": csv_data,
            "whitelist": "ALWAYS"
        }
        
        result = self.make_admin_request("POST", "/admin/tokens/import", data, 200)
        
        if result.get("error"):
            return False
            
        if "imported" in result:
            imported = result.get("imported", 0)
            skipped = result.get("skipped", 0)
            errors = result.get("errors", [])
            
            self.log(f"CSV import completed:")
            self.log(f"  Imported: {imported}")
            self.log(f"  Skipped: {skipped}")
            
            if errors:
                self.log(f"  Errors: {len(errors)}")
                for error in errors[:3]:  # Show first 3 errors
                    self.log(f"    Row {error.get('row')}: {error.get('error')}")
                    
            return True
        else:
            self.log_error("Import CSV response missing required fields")
            return False

    def test_ocpi_fetch_token_info(self) -> bool:
        """Test GET /api/ocpi/emsp/2.2.1/tokens/NL/CTP/04A2B3C4D5E6F7 - Fetch token info"""
        print("\n🔌 Test 7: OCPI Fetch Token Info...")
        
        # Use one of the tokens we imported
        result = self.make_ocpi_request("GET", "/ocpi/emsp/2.2.1/tokens/NL/CTP/04A2B3C4D5E6F7", None, 200)
        
        if result.get("error"):
            return False
            
        if "data" in result and "status_code" in result and "timestamp" in result:
            data = result["data"]
            self.log(f"OCPI token info retrieved successfully:")
            self.log(f"  Status Code: {result['status_code']}")
            self.log(f"  UID: {data.get('uid')}")
            self.log(f"  Type: {data.get('type')}")
            self.log(f"  Contract ID: {data.get('contract_id')}")
            self.log(f"  Valid: {data.get('valid')}")
            self.log(f"  Whitelist: {data.get('whitelist')}")
            
            # Verify OCPI format
            required_fields = ['country_code', 'party_id', 'uid', 'type', 'contract_id']
            if all(field in data for field in required_fields):
                self.log("All required OCPI fields present")
                return True
            else:
                self.log_error("OCPI response missing required fields")
                return False
        else:
            self.log_error("OCPI token response invalid format")
            return False

    def test_ocpi_authorize_valid_token(self) -> bool:
        """Test POST /api/ocpi/emsp/2.2.1/tokens/04A2B3C4D5E6F7/authorize - Authorize valid token"""
        print("\n✅ Test 8: OCPI Authorize Valid Token...")
        
        data = {
            "location_id": "LOC001",
            "evse_uid": "NL*CTP*E00001*1",
            "connector_id": "1"
        }
        
        result = self.make_ocpi_request("POST", "/ocpi/emsp/2.2.1/tokens/04A2B3C4D5E6F7/authorize", data, 200)
        
        if result.get("error"):
            return False
            
        if "data" in result and "status_code" in result:
            data = result["data"]
            allowed = data.get("allowed")
            self.log(f"OCPI authorization completed:")
            self.log(f"  Status Code: {result['status_code']}")
            self.log(f"  Allowed: {allowed}")
            
            if "token" in data:
                token = data["token"]
                self.log(f"  Token UID: {token.get('uid')}")
                self.log(f"  Token Valid: {token.get('valid')}")
                
            if "authorization_reference" in data:
                self.log(f"  Auth Reference: {data['authorization_reference']}")
                
            # Should be allowed for active token
            if allowed in ['ALLOWED', 'NO_CREDIT']:  # NO_CREDIT is also valid if user has no payment method
                return True
            else:
                self.log_error(f"Token authorization failed: {allowed}")
                return False
        else:
            self.log_error("OCPI authorization response invalid format")
            return False

    def test_ocpi_authorize_unknown_token(self) -> bool:
        """Test POST /api/ocpi/emsp/2.2.1/tokens/UNKNOWN/authorize - Authorization of unknown token"""
        print("\n❓ Test 9: OCPI Authorize Unknown Token...")
        
        data = {
            "location_id": "LOC001",
            "evse_uid": "NL*CTP*E00001*1",
            "connector_id": "1"
        }
        
        result = self.make_ocpi_request("POST", "/ocpi/emsp/2.2.1/tokens/UNKNOWN/authorize", data, 200)
        
        if result.get("error"):
            return False
            
        if "data" in result and "status_code" in result:
            data = result["data"]
            allowed = data.get("allowed")
            self.log(f"OCPI unknown token authorization:")
            self.log(f"  Status Code: {result['status_code']}")
            self.log(f"  Allowed: {allowed}")
            
            # Should return UNKNOWN for unknown token
            if allowed == "UNKNOWN":
                self.log("Correctly identified unknown token")
                return True
            else:
                self.log_error(f"Expected UNKNOWN, got: {allowed}")
                return False
        else:
            self.log_error("OCPI authorization response invalid format")
            return False

    def test_ocpi_authorize_blocked_token(self) -> bool:
        """Test authorization of blocked token"""
        print("\n🚫 Test 10: OCPI Authorize Blocked Token...")
        
        # Use our test token which we blocked earlier
        data = {
            "location_id": "LOC001",
            "evse_uid": "NL*CTP*E00001*1",
            "connector_id": "1"
        }
        
        result = self.make_ocpi_request("POST", f"/ocpi/emsp/2.2.1/tokens/{self.test_uid}/authorize", data, 200)
        
        if result.get("error"):
            return False
            
        if "data" in result and "status_code" in result:
            data = result["data"]
            allowed = data.get("allowed")
            self.log(f"OCPI blocked token authorization:")
            self.log(f"  Status Code: {result['status_code']}")
            self.log(f"  Allowed: {allowed}")
            
            # Should return BLOCKED for blocked token
            if allowed == "BLOCKED":
                self.log("Correctly blocked the token")
                return True
            else:
                self.log_error(f"Expected BLOCKED, got: {allowed}")
                return False
        else:
            self.log_error("OCPI authorization response invalid format")
            return False

    def test_ocpi_invalid_auth(self) -> bool:
        """Test GET with invalid token (should return 401)"""
        print("\n🔒 Test 11: OCPI Invalid Authentication...")
        
        # Make request with invalid token
        url = f"{BASE_URL}/ocpi/emsp/2.2.1/tokens/NL/CTP/04A2B3C4D5E6F7"
        headers = HEADERS.copy()
        headers["Authorization"] = "Token invalid-token-123"
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 401:
                self.log("Invalid authentication correctly rejected (401)")
                try:
                    data = response.json()
                    if data.get("status_code") == 2001:
                        self.log("Correct OCPI error code 2001 returned")
                        return True
                    else:
                        self.log_error(f"Expected OCPI error code 2001, got: {data.get('status_code')}")
                        return False
                except:
                    self.log_error("Response not valid JSON")
                    return False
            else:
                self.log_error(f"Expected 401, got {response.status_code}")
                return False
        except Exception as e:
            self.log_error(f"Request failed: {str(e)}")
            return False

    def test_duplicate_rfid_uid(self) -> bool:
        """Test duplicate RFID UID should return 409"""
        print("\n🔄 Test 12: Testing Duplicate RFID UID...")
        
        data = {
            "uid": self.test_uid,  # Same UID we used before
            "whitelist": "ALWAYS"
        }
        
        # Make request expecting 409 status code for duplicate
        url = f"{BASE_URL}/admin/tokens"
        headers = HEADERS.copy()
        headers["Authorization"] = f"Basic {self.admin_auth}"
        
        try:
            response = requests.post(url, headers=headers, json=data, timeout=10)
            if response.status_code == 409:
                self.log("Duplicate RFID UID correctly rejected (409)")
                try:
                    data = response.json()
                    if "existing_token_id" in data:
                        self.log(f"Existing token ID provided: {data['existing_token_id']}")
                    return True
                except:
                    self.log("Response received but not JSON")
                    return True
            else:
                self.log_error(f"Expected 409 for duplicate, got {response.status_code}")
                return False
        except Exception as e:
            self.log_error(f"Request failed: {str(e)}")
            return False

    def run_full_test_suite(self):
        """Run the complete RFID Token Management test suite"""
        print("🏷️  ChargeTap RFID Token Management Testing")
        print("=" * 60)
        print("Testing RFID Token Admin & OCPI eMSP Endpoints")
        
        # Test steps as specified in the review request
        tests = [
            ("Backend Health Check", self.test_backend_health),
            ("Create RFID Token (admin:chargetap2025)", self.test_create_rfid_token),
            ("List All Tokens", self.test_list_all_tokens),
            ("Get Token Details", self.test_get_token_details),
            ("Block Token", self.test_block_token),
            ("Get Token Statistics", self.test_get_token_stats),
            ("Import CSV Tokens", self.test_import_tokens_csv),
            ("OCPI Fetch Token Info", self.test_ocpi_fetch_token_info),
            ("OCPI Authorize Valid Token", self.test_ocpi_authorize_valid_token),
            ("OCPI Authorize Unknown Token", self.test_ocpi_authorize_unknown_token),
            ("OCPI Authorize Blocked Token", self.test_ocpi_authorize_blocked_token),
            ("OCPI Invalid Authentication", self.test_ocpi_invalid_auth),
            ("Test Duplicate UID (409)", self.test_duplicate_rfid_uid),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
                    if test_name == "Backend Health Check":
                        print(f"\n💥 Critical test '{test_name}' failed. Stopping execution.")
                        break
            except Exception as e:
                print(f"❌ ERROR in {test_name}: {str(e)}")
                failed += 1
                
        print("\n" + "=" * 60)
        print("🏁 RFID TOKEN MANAGEMENT TEST SUMMARY")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Total:  {passed + failed}")
        
        if failed == 0:
            print("\n🎉 ALL RFID TOKEN TESTS PASSED! ChargeTap RFID Token Management is working correctly.")
            return True
        else:
            print(f"\n⚠️  {failed} test(s) failed. Please check the issues above.")
            return False

def main():
    tester = RFIDTokenTester()
    success = tester.run_full_test_suite()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()