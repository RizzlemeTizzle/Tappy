#!/usr/bin/env python3
"""
ChargeTap Backend API Testing Suite
Tests the complete flow from user registration to session management
"""

import requests
import json
import time
import sys
from datetime import datetime

# Backend URL from frontend .env
BASE_URL = "https://nfc-charge-now.preview.emergentagent.com/api"

class ChargeTapAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.user_data = {
            "email": "test@chargetap.com",
            "password": "test123",
            "name": "Test User"
        }
        self.session_id = None
        self.charger_id = "charger-001a"  # From seed data
        
    def log(self, message, level="INFO"):
        """Log messages with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
    
    def make_request(self, method, endpoint, data=None, auth=True):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                response = requests.request(method, url, json=data, headers=headers, timeout=30)
            
            self.log(f"{method.upper()} {endpoint} -> {response.status_code}")
            
            return response
            
        except requests.exceptions.Timeout:
            self.log(f"Timeout error for {method.upper()} {endpoint}", "ERROR")
            return None
        except requests.exceptions.ConnectionError:
            self.log(f"Connection error for {method.upper()} {endpoint}", "ERROR")
            return None
        except Exception as e:
            self.log(f"Error for {method.upper()} {endpoint}: {str(e)}", "ERROR")
            return None
    
    def test_1_register_user(self):
        """Test 1: Register a new user"""
        self.log("=== Testing User Registration ===")
        
        response = self.make_request("POST", "/auth/register", self.user_data, auth=False)
        
        if not response:
            return False, "Failed to make registration request"
        
        if response.status_code != 200:
            return False, f"Registration failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if "token" not in data:
                return False, "No token in registration response"
            
            self.token = data["token"]
            self.log(f"Registration successful, token received")
            return True, "User registration successful"
            
        except ValueError:
            return False, "Invalid JSON response from registration"
    
    def test_2_login_user(self):
        """Test 2: Login with the user"""
        self.log("=== Testing User Login ===")
        
        login_data = {
            "email": self.user_data["email"],
            "password": self.user_data["password"]
        }
        
        response = self.make_request("POST", "/auth/login", login_data, auth=False)
        
        if not response:
            return False, "Failed to make login request"
        
        if response.status_code != 200:
            return False, f"Login failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if "token" not in data:
                return False, "No token in login response"
            
            # Update token with fresh login token
            self.token = data["token"]
            self.log("Login successful, new token received")
            return True, "User login successful"
            
        except ValueError:
            return False, "Invalid JSON response from login"
    
    def test_3_get_stations(self):
        """Test 3: Get stations list (no auth required)"""
        self.log("=== Testing Get Stations ===")
        
        response = self.make_request("GET", "/stations", auth=False)
        
        if not response:
            return False, "Failed to make get stations request"
        
        if response.status_code != 200:
            return False, f"Get stations failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Stations response is not a list"
            
            if len(data) == 0:
                return False, "No stations returned"
            
            self.log(f"Found {len(data)} stations")
            
            # Check if our target charger exists
            charger_found = False
            for station in data:
                if "chargers" in station:
                    for charger in station["chargers"]:
                        if charger.get("id") == self.charger_id:
                            charger_found = True
                            self.log(f"Target charger {self.charger_id} found")
                            break
            
            if not charger_found:
                return False, f"Target charger {self.charger_id} not found in stations"
            
            return True, f"Get stations successful, found {len(data)} stations"
            
        except ValueError:
            return False, "Invalid JSON response from get stations"
    
    def test_4_add_payment_method(self):
        """Test 4: Add payment method (requires Bearer token)"""
        self.log("=== Testing Add Payment Method ===")
        
        payment_data = {
            "card_number": "4242424242424242",
            "expiry": "12/25",
            "cvv": "123"
        }
        
        response = self.make_request("POST", "/users/payment-method", payment_data, auth=True)
        
        if not response:
            return False, "Failed to make add payment method request"
        
        if response.status_code != 200:
            return False, f"Add payment method failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not data.get("success"):
                return False, "Payment method addition was not successful"
            
            if "last4" not in data:
                return False, "No last4 digits in payment method response"
            
            self.log(f"Payment method added successfully, last4: {data['last4']}")
            return True, "Payment method added successfully"
            
        except ValueError:
            return False, "Invalid JSON response from add payment method"
    
    def test_5_resolve_nfc(self):
        """Test 5: Resolve NFC (requires Bearer token)"""
        self.log("=== Testing NFC Resolve ===")
        
        nfc_data = {
            "nfc_payload": "CHARGETAP-001A"
        }
        
        response = self.make_request("POST", "/nfc/resolve", nfc_data, auth=True)
        
        if not response:
            return False, "Failed to make NFC resolve request"
        
        if response.status_code != 200:
            return False, f"NFC resolve failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            required_keys = ["charger", "station", "pricing"]
            
            for key in required_keys:
                if key not in data:
                    return False, f"Missing {key} in NFC resolve response"
            
            charger_id = data["charger"].get("id")
            if charger_id != self.charger_id:
                return False, f"Unexpected charger ID: {charger_id}, expected: {self.charger_id}"
            
            self.log(f"NFC resolved to charger {charger_id} at station {data['station']['name']}")
            return True, "NFC resolve successful"
            
        except ValueError:
            return False, "Invalid JSON response from NFC resolve"
    
    def test_6_start_session(self):
        """Test 6: Start a charging session (requires Bearer token)"""
        self.log("=== Testing Start Session ===")
        
        session_data = {
            "charger_id": self.charger_id
        }
        
        response = self.make_request("POST", "/sessions/start", session_data, auth=True)
        
        if not response:
            return False, "Failed to make start session request"
        
        if response.status_code != 200:
            return False, f"Start session failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if "session_id" not in data:
                return False, "No session_id in start session response"
            
            self.session_id = data["session_id"]
            self.log(f"Session started successfully, session_id: {self.session_id}")
            return True, f"Charging session started successfully (ID: {self.session_id})"
            
        except ValueError:
            return False, "Invalid JSON response from start session"
    
    def test_7_get_session_status(self):
        """Test 7: Get session status (requires Bearer token)"""
        self.log("=== Testing Get Session Status ===")
        
        if not self.session_id:
            return False, "No session_id available for status check"
        
        response = self.make_request("GET", f"/sessions/{self.session_id}", auth=True)
        
        if not response:
            return False, "Failed to make get session status request"
        
        if response.status_code != 200:
            return False, f"Get session status failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            required_keys = ["id", "status", "delivered_kwh", "current_power_kw", "battery_percent"]
            
            for key in required_keys:
                if key not in data:
                    return False, f"Missing {key} in session status response"
            
            status = data["status"]
            power = data["current_power_kw"]
            battery = data["battery_percent"]
            kwh = data["delivered_kwh"]
            
            self.log(f"Session status: {status}, Power: {power}kW, Battery: {battery}%, Energy: {kwh}kWh")
            return True, f"Session status retrieved successfully (Status: {status})"
            
        except ValueError:
            return False, "Invalid JSON response from get session status"
    
    def test_8_stop_session(self):
        """Test 8: Stop session (requires Bearer token)"""
        self.log("=== Testing Stop Session ===")
        
        if not self.session_id:
            return False, "No session_id available for stopping"
        
        # Wait a bit for some charging simulation
        self.log("Waiting 5 seconds for charging simulation...")
        time.sleep(5)
        
        response = self.make_request("POST", f"/sessions/{self.session_id}/stop", auth=True)
        
        if not response:
            return False, "Failed to make stop session request"
        
        if response.status_code != 200:
            return False, f"Stop session failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            required_keys = ["id", "status", "ended_at", "total_cost_cents", "payment"]
            
            for key in required_keys:
                if key not in data:
                    return False, f"Missing {key} in stop session response"
            
            if data["status"] != "ENDED":
                return False, f"Session status is {data['status']}, expected ENDED"
            
            total_cost = data["total_cost_cents"]
            payment_status = data["payment"]["status"]
            
            self.log(f"Session stopped successfully, total cost: ${total_cost/100:.2f}, payment: {payment_status}")
            return True, f"Session stopped successfully (Cost: ${total_cost/100:.2f})"
            
        except ValueError:
            return False, "Invalid JSON response from stop session"
    
    def test_9_get_session_history(self):
        """Test 9: Get session history (requires Bearer token)"""
        self.log("=== Testing Get Session History ===")
        
        response = self.make_request("GET", "/sessions/user/history", auth=True)
        
        if not response:
            return False, "Failed to make get session history request"
        
        if response.status_code != 200:
            return False, f"Get session history failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Session history response is not a list"
            
            if len(data) == 0:
                return False, "No sessions in history"
            
            # Check if our session is in the history
            session_found = False
            for session in data:
                if session.get("id") == self.session_id:
                    session_found = True
                    break
            
            if not session_found:
                return False, f"Session {self.session_id} not found in history"
            
            self.log(f"Session history retrieved successfully, found {len(data)} sessions")
            return True, f"Session history retrieved successfully ({len(data)} sessions)"
            
        except ValueError:
            return False, "Invalid JSON response from get session history"
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log("=== Starting ChargeTap Backend API Testing ===")
        
        # First, seed data to ensure we have test data
        self.log("Seeding demo data...")
        seed_response = self.make_request("POST", "/seed", auth=False)
        if seed_response and seed_response.status_code == 200:
            self.log("Demo data seeded successfully")
        else:
            self.log("Warning: Failed to seed demo data", "WARN")
        
        tests = [
            ("User Registration", self.test_1_register_user),
            ("User Login", self.test_2_login_user),
            ("Get Stations List", self.test_3_get_stations),
            ("Add Payment Method", self.test_4_add_payment_method),
            ("NFC Resolve", self.test_5_resolve_nfc),
            ("Start Charging Session", self.test_6_start_session),
            ("Get Session Status", self.test_7_get_session_status),
            ("Stop Session", self.test_8_stop_session),
            ("Get Session History", self.test_9_get_session_history)
        ]
        
        results = {}
        failed_tests = []
        
        for test_name, test_func in tests:
            self.log(f"\n--- Running: {test_name} ---")
            try:
                success, message = test_func()
                results[test_name] = {
                    "success": success,
                    "message": message
                }
                
                if success:
                    self.log(f"✅ PASS: {message}")
                else:
                    self.log(f"❌ FAIL: {message}", "ERROR")
                    failed_tests.append(test_name)
                    
            except Exception as e:
                error_msg = f"Test exception: {str(e)}"
                results[test_name] = {
                    "success": False,
                    "message": error_msg
                }
                self.log(f"❌ ERROR: {error_msg}", "ERROR")
                failed_tests.append(test_name)
        
        # Summary
        self.log("\n=== TEST SUMMARY ===")
        passed = len([r for r in results.values() if r["success"]])
        total = len(results)
        
        self.log(f"Total Tests: {total}")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {len(failed_tests)}")
        
        if failed_tests:
            self.log(f"\nFailed Tests: {', '.join(failed_tests)}")
            return False
        else:
            self.log("\n🎉 All tests passed!")
            return True

def main():
    """Main function to run tests"""
    tester = ChargeTapAPITester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()