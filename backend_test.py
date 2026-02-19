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

    # NEW MAP/NEARBY STATIONS TESTS
    
    def test_10_map_user_registration(self):
        """Test 10: Register map test user (mapuser@test.com)"""
        self.log("=== Testing Map User Registration ===")
        
        map_user_data = {
            "email": "mapuser@test.com",
            "password": "test123",
            "name": "Map User"
        }
        
        response = self.make_request("POST", "/auth/register", map_user_data, auth=False)
        
        if not response:
            return False, "Failed to make map user registration request"
        
        # Try registration first, fallback to login if user exists
        if response.status_code == 200:
            try:
                data = response.json()
                if "token" not in data:
                    return False, "No token in registration response"
                
                self.token = data["token"]  # Update token for map user
                self.log(f"Map user registration successful")
                return True, "Map user registration successful"
                
            except ValueError:
                return False, "Invalid JSON response from registration"
        
        elif response.status_code == 400:
            # User exists, try login
            self.log("User exists, trying login...")
            login_data = {
                "email": "mapuser@test.com",
                "password": "test123"
            }
            
            login_response = self.make_request("POST", "/auth/login", login_data, auth=False)
            
            if login_response and login_response.status_code == 200:
                try:
                    data = login_response.json()
                    self.token = data["token"]
                    self.log("Map user login successful")
                    return True, "Map user login successful (user existed)"
                except ValueError:
                    return False, "Invalid JSON response from login"
            else:
                return False, f"Login failed after registration conflict"
        else:
            return False, f"Registration failed with status {response.status_code}: {response.text}"
    
    def test_11_add_payment_method_map_user(self):
        """Test 11: Add payment method for map user"""
        self.log("=== Testing Add Payment Method (Map User) ===")
        
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
            
            if "last4" not in data or data["last4"] != "4242":
                return False, "Incorrect last4 digits in payment method response"
            
            self.log(f"Payment method added successfully for map user")
            return True, "Payment method added successfully for map user"
            
        except ValueError:
            return False, "Invalid JSON response from add payment method"
    
    def test_12_nearby_stations_basic(self):
        """Test 12: Get nearby stations with basic parameters"""
        self.log("=== Testing Nearby Stations (Basic) ===")
        
        # Rotterdam coordinates with 10km radius
        params = "lat=51.9244&lng=4.4777&radius_km=10"
        
        response = self.make_request("GET", f"/stations/nearby?{params}", auth=False)
        
        if not response:
            return False, "Failed to make nearby stations request"
        
        if response.status_code != 200:
            return False, f"Nearby stations failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Nearby stations response is not a list"
            
            if len(data) == 0:
                return False, "No nearby stations found"
            
            # Validate first station has required fields
            station = data[0]
            required_fields = ["id", "name", "address", "latitude", "longitude", "distance_km", "pricing_summary", "availability"]
            missing_fields = [field for field in required_fields if field not in station]
            
            if missing_fields:
                return False, f"Missing fields in station: {missing_fields}"
            
            self.log(f"Found {len(data)} nearby stations, nearest: {station['name']} ({station['distance_km']}km)")
            return True, f"Found {len(data)} nearby stations"
            
        except ValueError:
            return False, "Invalid JSON response from nearby stations"
    
    def test_13_nearby_stations_connector_filter(self):
        """Test 13: Get nearby stations filtered by connector type"""
        self.log("=== Testing Nearby Stations (Connector Filter) ===")
        
        params = "lat=51.9244&lng=4.4777&radius_km=10&connector_type=CCS"
        
        response = self.make_request("GET", f"/stations/nearby?{params}", auth=False)
        
        if not response:
            return False, "Failed to make connector filter request"
        
        if response.status_code != 200:
            return False, f"Connector filter failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Response is not a list"
            
            # Check that returned stations have CCS connectors
            ccs_stations = 0
            for station in data:
                if "availability" in station and "connector_breakdown" in station["availability"]:
                    if "CCS" in station["availability"]["connector_breakdown"]:
                        ccs_stations += 1
            
            self.log(f"Found {len(data)} stations with CCS filter, {ccs_stations} have CCS")
            return True, f"Connector filter working, found {len(data)} stations"
            
        except ValueError:
            return False, "Invalid JSON response from connector filter"
    
    def test_14_nearby_stations_sort_by_price(self):
        """Test 14: Get nearby stations sorted by price"""
        self.log("=== Testing Nearby Stations (Sort by Price) ===")
        
        params = "lat=51.9244&lng=4.4777&radius_km=10&sort_by=price"
        
        response = self.make_request("GET", f"/stations/nearby?{params}", auth=False)
        
        if not response:
            return False, "Failed to make sort by price request"
        
        if response.status_code != 200:
            return False, f"Sort by price failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Response is not a list"
            
            if len(data) > 1:
                # Check if sorted by energy rate
                prices = [station["pricing_summary"]["energy_rate_cents_per_kwh"] for station in data if "pricing_summary" in station]
                is_sorted = all(prices[i] <= prices[i+1] for i in range(len(prices)-1))
                
                if is_sorted:
                    self.log(f"Stations properly sorted by price: {prices[0]} to {prices[-1]} cents/kWh")
                else:
                    self.log(f"Stations not properly sorted by price")
                    return False, "Stations not sorted by price"
            
            return True, f"Price sorting working, found {len(data)} stations"
            
        except ValueError:
            return False, "Invalid JSON response from price sort"
    
    def test_15_nearby_stations_available_only(self):
        """Test 15: Get nearby stations with available_only filter"""
        self.log("=== Testing Nearby Stations (Available Only) ===")
        
        params = "lat=51.9244&lng=4.4777&radius_km=10&available_only=true"
        
        response = self.make_request("GET", f"/stations/nearby?{params}", auth=False)
        
        if not response:
            return False, "Failed to make available only request"
        
        if response.status_code != 200:
            return False, f"Available only filter failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if not isinstance(data, list):
                return False, "Response is not a list"
            
            # Check that all returned stations have available chargers
            for station in data:
                available_count = station.get("availability", {}).get("available_count", 0)
                if available_count == 0:
                    return False, f"Station {station['name']} has no available chargers but was returned"
            
            self.log(f"Available only filter working, found {len(data)} stations with available chargers")
            return True, f"Available only filter working, {len(data)} stations"
            
        except ValueError:
            return False, "Invalid JSON response from available only filter"
    
    def test_16_get_station_details(self):
        """Test 16: Get individual station details"""
        self.log("=== Testing Get Station Details ===")
        
        station_id = "station-001"
        
        response = self.make_request("GET", f"/stations/{station_id}", auth=False)
        
        if not response:
            return False, "Failed to make get station details request"
        
        if response.status_code != 200:
            return False, f"Get station details failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            required_fields = ["id", "name", "address", "latitude", "longitude", "chargers", "pricing"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                return False, f"Missing fields in station details: {missing_fields}"
            
            charger_count = len(data["chargers"]) if data["chargers"] else 0
            self.log(f"Station details retrieved: {data['name']} with {charger_count} chargers")
            return True, f"Station details retrieved successfully"
            
        except ValueError:
            return False, "Invalid JSON response from station details"
    
    def test_17_simulate_availability(self):
        """Test 17: Test availability simulator"""
        self.log("=== Testing Availability Simulator ===")
        
        response = self.make_request("POST", "/simulate/availability", {}, auth=False)
        
        if not response:
            return False, "Failed to make simulate availability request"
        
        if response.status_code != 200:
            return False, f"Simulate availability failed with status {response.status_code}: {response.text}"
        
        try:
            data = response.json()
            if "message" not in data:
                return False, "No message in simulate availability response"
            
            message = data["message"]
            if "Updated" not in message:
                return False, f"Unexpected simulator response: {message}"
            
            self.log(f"Availability simulation completed: {message}")
            return True, "Availability simulator working correctly"
            
        except ValueError:
            return False, "Invalid JSON response from simulate availability"
    
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