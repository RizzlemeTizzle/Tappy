#!/usr/bin/env python3

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

# Test configuration - Using the external URL from frontend/.env
BASE_URL = "https://ev-remote-start.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class ChargeTapTester:
    def __init__(self):
        self.session_token = None
        self.session_id = None
        self.user_id = None
        
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
                
    def make_request(self, method: str, endpoint: str, data: Dict = None, expect_status: int = 200) -> Dict[str, Any]:
        """Make HTTP request with proper error handling"""
        url = f"{BASE_URL}{endpoint}"
        headers = HEADERS.copy()
        
        if self.session_token:
            headers["Authorization"] = f"Bearer {self.session_token}"
            
        try:
            if method == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            if response.status_code != expect_status:
                self.log_error(f"Unexpected status code for {method} {endpoint}", response)
                return {"error": True, "status": response.status_code}
                
            return response.json()
            
        except requests.exceptions.RequestException as e:
            self.log_error(f"Request failed for {method} {endpoint}: {str(e)}")
            return {"error": True, "message": str(e)}
            
    def test_health_check(self) -> bool:
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
            
    def test_user_registration(self) -> bool:
        """Test user registration (Step 1)"""
        print("\n👤 Step 1: Testing User Registration...")
        
        data = {
            "email": "tester@test.nl",
            "password": "test123",
            "name": "Tester"
        }
        
        result = self.make_request("POST", "/auth/register", data, 200)
        
        if result.get("error"):
            # Try login instead if user exists
            if result.get("status") == 400:
                self.log("User already exists, trying login instead...")
                return self.test_user_login()
            return False
            
        if "token" in result and "user" in result:
            self.session_token = result["token"]
            self.user_id = result["user"]["id"]
            self.log(f"User registered successfully: {result['user']['email']}")
            return True
        else:
            self.log_error("Registration response missing token or user data")
            return False
            
    def test_user_login(self) -> bool:
        """Test user login (Step 2)"""
        print("\n🔐 Step 2: Testing User Login...")
        
        data = {
            "email": "tester@test.nl",
            "password": "test123"
        }
        
        result = self.make_request("POST", "/auth/login", data, 200)
        
        if result.get("error"):
            return False
            
        if "token" in result and "user" in result:
            self.session_token = result["token"]
            self.user_id = result["user"]["id"]
            self.log(f"User logged in successfully: {result['user']['email']}")
            return True
        else:
            self.log_error("Login response missing token or user data")
            return False
            
    def test_add_payment_method(self) -> bool:
        """Test adding payment method (Step 3)"""
        print("\n💳 Step 3: Testing Add Payment Method...")
        
        if not self.session_token:
            self.log_error("No session token available")
            return False
            
        data = {
            "card_number": "4242424242424242",
            "expiry": "12/27",
            "cvv": "123"
        }
        
        result = self.make_request("POST", "/users/payment-method", data, 200)
        
        if result.get("error"):
            return False
            
        if result.get("success") and result.get("last4"):
            self.log(f"Payment method added successfully (card ending in {result['last4']})")
            return True
        else:
            self.log_error("Payment method addition failed")
            return False
            
    def test_nearby_stations(self) -> bool:
        """Test get nearby stations (Step 4)"""
        print("\n📍 Step 4: Testing Get Nearby Stations...")
        
        # Rotterdam coordinates as specified
        result = self.make_request("GET", "/stations/nearby?lat=51.9244&lng=4.4777", None, 200)
        
        if result.get("error"):
            return False
            
        if isinstance(result, list) and len(result) > 0:
            self.log(f"Found {len(result)} nearby stations")
            # Show first station as example
            station = result[0]
            self.log(f"  Example station: {station.get('name', 'Unknown')} ({station.get('distance_km', '?')}km away)")
            return True
        else:
            self.log_error("No nearby stations found or invalid response format")
            return False
            
    def test_cost_estimate(self) -> bool:
        """Test get cost estimate (Step 5)"""
        print("\n💰 Step 5: Testing Get Cost Estimate...")
        
        if not self.session_token:
            self.log_error("No session token available")
            return False
            
        # Use charger-002-a as specified in the request
        result = self.make_request("GET", "/charging/estimate?charger_id=charger-002-a", None, 200)
        
        if result.get("error"):
            return False
            
        if "estimate" in result and "charger" in result:
            estimate = result["estimate"]
            charger = result["charger"]
            total = estimate["total_display"]
            self.log(f"Cost estimate for {charger['station_name']}: {total} for {estimate['target_kwh']}kWh")
            return True
        else:
            self.log_error("Cost estimate response missing required data")
            return False
            
    def test_start_charging(self) -> bool:
        """Test start OCPI remote charging (Step 6)"""
        print("\n⚡ Step 6: Testing Start OCPI Remote Charging...")
        
        if not self.session_token:
            self.log_error("No session token available")
            return False
            
        data = {
            "charger_id": "charger-002-a"
        }
        
        result = self.make_request("POST", "/charging/start", data, 200)
        
        if result.get("error"):
            return False
            
        if "session_id" in result and "command_id" in result:
            self.session_id = result["session_id"]
            command_id = result["command_id"]
            status = result.get("status", "UNKNOWN")
            self.log(f"Remote start initiated - Session: {self.session_id}, Command: {command_id}, Status: {status}")
            
            # Wait a moment for the async processing to complete
            time.sleep(2)
            return True
        else:
            self.log_error("Start charging response missing session_id or command_id")
            return False
            
    def test_session_status(self) -> bool:
        """Test get live session status (Step 7)"""
        print("\n📊 Step 7: Testing Get Live Session Status...")
        
        if not self.session_token or not self.session_id:
            self.log_error("No session token or session ID available")
            return False
            
        result = self.make_request("GET", f"/charging/status/{self.session_id}", None, 200)
        
        if result.get("error"):
            return False
            
        if "id" in result and "status" in result:
            status = result["status"]
            live_data = result.get("live_data", {})
            cost = result.get("cost", {})
            
            delivered_kwh = live_data.get("delivered_kwh", 0)
            current_power = live_data.get("current_power_kw", 0)
            battery_percent = live_data.get("battery_percent", 0)
            total_cost_cents = cost.get("total_cents", 0)
            
            self.log(f"Session status: {status}")
            self.log(f"  Delivered: {delivered_kwh:.2f}kWh, Power: {current_power:.1f}kW")
            self.log(f"  Battery: {battery_percent}%, Cost: €{total_cost_cents/100:.2f}")
            return True
        else:
            self.log_error("Session status response missing required data")
            return False
            
    def test_stop_charging(self) -> bool:
        """Test stop charging (Step 8)"""
        print("\n🛑 Step 8: Testing Stop Charging...")
        
        if not self.session_token or not self.session_id:
            self.log_error("No session token or session ID available")
            return False
            
        data = {
            "session_id": self.session_id
        }
        
        result = self.make_request("POST", "/charging/stop", data, 200)
        
        if result.get("error"):
            return False
            
        if "session_id" in result and "status" in result:
            status = result["status"]
            final_cost = result.get("final_cost", {})
            session_summary = result.get("session_summary", {})
            
            total_cents = final_cost.get("total_cents", 0)
            delivered_kwh = session_summary.get("delivered_kwh", 0)
            duration_min = session_summary.get("duration_minutes", 0)
            
            self.log(f"Charging stopped successfully - Status: {status}")
            self.log(f"  Final cost: €{total_cents/100:.2f}, Energy: {delivered_kwh:.2f}kWh, Duration: {duration_min}min")
            return True
        else:
            self.log_error("Stop charging response missing required data")
            return False
            
    def test_check_cdr(self) -> bool:
        """Test check CDR was created (Step 9)"""
        print("\n📄 Step 9: Testing Check CDR Creation...")
        
        result = self.make_request("GET", "/ocpi/2.2.1/cdrs", None, 200)
        
        if result.get("error"):
            return False
            
        if "data" in result and isinstance(result["data"], list):
            cdrs = result["data"]
            self.log(f"Found {len(cdrs)} CDRs in system")
            
            if len(cdrs) > 0:
                # Check latest CDR
                latest_cdr = cdrs[0]
                cdr_id = latest_cdr.get("id", "Unknown")
                session_id = latest_cdr.get("session_id", "Unknown") 
                total_cost = latest_cdr.get("total_cost", 0)
                total_energy = latest_cdr.get("total_energy", 0)
                
                self.log(f"  Latest CDR: {cdr_id} (Session: {session_id})")
                self.log(f"  Cost: €{total_cost:.2f}, Energy: {total_energy:.2f}kWh")
                return True
            else:
                self.log_error("No CDRs found in the system")
                return False
        else:
            self.log_error("CDR response missing data array")
            return False
            
    def run_full_test_suite(self):
        """Run the complete OCPI 2.2.1 Remote Start/Stop flow test"""
        print("🚀 ChargeTap Node.js/Fastify/PostgreSQL Backend Testing")
        print("=" * 60)
        print("Testing OCPI 2.2.1 Remote Start/Stop Flow")
        
        # Test steps as specified in the review request
        tests = [
            ("Backend Health Check", self.test_health_check),
            ("User Registration", self.test_user_registration),  
            ("User Login", self.test_user_login),
            ("Add Payment Method", self.test_add_payment_method),
            ("Get Nearby Stations", self.test_nearby_stations),
            ("Get Cost Estimate", self.test_cost_estimate),
            ("Start OCPI Remote Charging", self.test_start_charging),
            ("Get Live Session Status", self.test_session_status),
            ("Stop Charging", self.test_stop_charging),
            ("Check CDR Creation", self.test_check_cdr)
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
                    if test_name in ["Backend Health Check", "User Registration", "User Login"]:
                        print(f"\n💥 Critical test '{test_name}' failed. Stopping execution.")
                        break
            except Exception as e:
                print(f"❌ ERROR in {test_name}: {str(e)}")
                failed += 1
                
        print("\n" + "=" * 60)
        print("🏁 TEST SUMMARY")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📊 Total:  {passed + failed}")
        
        if failed == 0:
            print("\n🎉 ALL TESTS PASSED! ChargeTap Node.js backend is working correctly.")
            return True
        else:
            print(f"\n⚠️  {failed} test(s) failed. Please check the issues above.")
            return False

def main():
    tester = ChargeTapTester()
    success = tester.run_full_test_suite()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()