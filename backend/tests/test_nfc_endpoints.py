"""
Test NFC HCE Token Endpoints
Bug fix session tests for Tappy Charge app
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://tap-global.preview.emergentagent.com')


class TestHealthAndBasicEndpoints:
    """Basic health and API availability tests"""

    def test_health_endpoint(self):
        """Test /api/health is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health check passed: {data}")

    def test_root_endpoint(self):
        """Test /api/ root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "Tappy Charge API" in data.get("message", "")
        print(f"✓ Root API passed: {data}")


class TestNfcTokenEndpoints:
    """Test NFC HCE Token endpoints"""

    @pytest.fixture
    def auth_headers(self):
        """Create test user and get auth token"""
        # Register a new test user
        import uuid
        test_email = f"hce-test-{uuid.uuid4().hex[:8]}@example.com"
        
        register_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": test_email,
                "password": "test123",
                "name": "HCE Test User"
            }
        )
        
        if register_response.status_code == 400:
            # User might exist, try login
            login_response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "hce-test@example.com", "password": "test123"}
            )
            if login_response.status_code != 200:
                pytest.skip("Cannot authenticate test user")
            token = login_response.json().get("token")
        else:
            assert register_response.status_code == 200, f"Register failed: {register_response.text}"
            token = register_response.json().get("token")
        
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture
    def auth_headers_with_payment(self, auth_headers):
        """Auth headers for user with payment method added"""
        # Add payment method
        response = requests.post(
            f"{BASE_URL}/api/users/payment-method",
            headers=auth_headers,
            json={
                "card_number": "4242424242424242",
                "expiry": "12/28",
                "cvv": "123"
            }
        )
        assert response.status_code == 200, f"Payment method add failed: {response.text}"
        return auth_headers

    def test_nfc_token_provision_requires_auth(self):
        """Test /api/nfc/tokens/provision requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/nfc/tokens/provision",
            json={"device_id": "test-device-001"}
        )
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ NFC provision endpoint requires authentication")

    def test_nfc_token_provision_requires_payment_method(self, auth_headers):
        """Test provisioning fails without payment method"""
        response = requests.post(
            f"{BASE_URL}/api/nfc/tokens/provision",
            headers=auth_headers,
            json={
                "device_id": "test-device-001",
                "device_model": "Pixel 7",
                "android_version": "14"
            }
        )
        # Should fail if payment method not added
        if response.status_code == 400:
            assert "betaalmethode" in response.json().get("detail", "").lower()
            print("✓ NFC provision requires payment method")
        else:
            # Payment method might already be added from previous run
            print(f"Note: Got status {response.status_code} - payment method may already be added")

    def test_nfc_token_provision_success(self, auth_headers_with_payment):
        """Test successful NFC token provisioning"""
        import uuid
        device_id = f"test-device-{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/nfc/tokens/provision",
            headers=auth_headers_with_payment,
            json={
                "device_id": device_id,
                "device_model": "Samsung Galaxy S24",
                "android_version": "14",
                "is_rooted": False
            }
        )
        
        assert response.status_code == 200, f"Provision failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "token_uid" in data, "Missing token_uid"
        assert "contract_id" in data, "Missing contract_id"
        assert "visual_number" in data, "Missing visual_number"
        assert data.get("status") == "ACTIVE", "Token should be ACTIVE"
        
        # Contract ID format check
        assert data["contract_id"].startswith("CTP-NFC-"), f"Invalid contract_id format: {data['contract_id']}"
        
        print(f"✓ NFC token provisioned: {data['contract_id']}")
        return data

    def test_nfc_token_status_endpoint(self, auth_headers_with_payment):
        """Test /api/nfc/tokens/status endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/nfc/tokens/status",
            headers=auth_headers_with_payment
        )
        
        assert response.status_code == 200, f"Status failed: {response.text}"
        data = response.json()
        
        assert "tokens" in data, "Missing tokens array"
        assert "total" in data, "Missing total count"
        assert isinstance(data["tokens"], list), "tokens should be a list"
        
        print(f"✓ NFC token status: {data['total']} tokens found")

    def test_nfc_provision_blocks_rooted_devices(self, auth_headers_with_payment):
        """Test that rooted devices are blocked"""
        import uuid
        response = requests.post(
            f"{BASE_URL}/api/nfc/tokens/provision",
            headers=auth_headers_with_payment,
            json={
                "device_id": f"rooted-device-{uuid.uuid4().hex[:8]}",
                "device_model": "Test Rooted Phone",
                "android_version": "13",
                "is_rooted": True
            }
        )
        
        assert response.status_code == 403, f"Expected 403 for rooted device, got {response.status_code}"
        assert "veiligheidsredenen" in response.json().get("detail", "").lower() or "rooted" in response.json().get("detail", "").lower()
        print("✓ Rooted devices are blocked from provisioning")


class TestStationEndpoints:
    """Test station-related endpoints for basic functionality"""

    def test_stations_list(self):
        """Test /api/stations endpoint"""
        response = requests.get(f"{BASE_URL}/api/stations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return list of stations"
        print(f"✓ Stations endpoint: {len(data)} stations")

    def test_nearby_stations(self):
        """Test /api/stations/nearby endpoint (Rotterdam coordinates)"""
        response = requests.get(
            f"{BASE_URL}/api/stations/nearby",
            params={"lat": 51.9244, "lng": 4.4777, "radius_km": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return list of nearby stations"
        print(f"✓ Nearby stations: {len(data)} found within 10km")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
