"""
Guest Mode Backend Tests
Tests for public endpoints that work without authentication.
These endpoints are critical for guest users browsing stations/pricing.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tap-global.preview.emergentagent.com').rstrip('/')

class TestPublicEndpoints:
    """Tests for endpoints that should work without authentication"""
    
    def test_health_check(self):
        """Health endpoint should always be accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_get_stations_public(self):
        """GET /api/stations should work without auth for guest mode"""
        response = requests.get(f"{BASE_URL}/api/stations")
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertions
        data = response.json()
        assert isinstance(data, list), "Expected list of stations"
        assert len(data) > 0, "Expected at least one station"
        
        # Validate station structure
        first_station = data[0]
        assert "id" in first_station
        assert "name" in first_station
        assert "address" in first_station
        assert "latitude" in first_station
        assert "longitude" in first_station
        assert "chargers" in first_station
        assert "pricing" in first_station
        
        # Validate charger structure
        assert len(first_station["chargers"]) > 0, "Station should have chargers"
        charger = first_station["chargers"][0]
        assert "id" in charger
        assert "connector_type" in charger
        assert "max_kw" in charger
        assert "status" in charger
        
        # Validate pricing structure
        pricing = first_station["pricing"]
        assert "start_fee_cents" in pricing
        assert "energy_rate_cents_per_kwh" in pricing
        assert "tax_percent" in pricing
        
        print(f"✓ GET /api/stations returned {len(data)} stations")
    
    def test_get_nearby_stations_public(self):
        """GET /api/stations/nearby should work without auth for guest mode"""
        # Rotterdam coordinates
        lat = 51.9244
        lng = 4.4777
        radius = 10.0
        
        response = requests.get(
            f"{BASE_URL}/api/stations/nearby",
            params={"lat": lat, "lng": lng, "radius_km": radius}
        )
        
        # Status assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Data assertions
        data = response.json()
        assert isinstance(data, list), "Expected list of stations"
        assert len(data) > 0, "Expected at least one nearby station"
        
        # Validate nearby-specific fields
        first_station = data[0]
        assert "distance_km" in first_station
        assert "pricing_summary" in first_station
        assert "availability" in first_station
        
        # Validate pricing summary
        pricing = first_station["pricing_summary"]
        assert "start_fee_cents" in pricing
        assert "energy_rate_cents_per_kwh" in pricing
        assert "estimated_20kwh_cents" in pricing
        
        # Validate availability
        availability = first_station["availability"]
        assert "available_count" in availability
        assert "total_count" in availability
        
        print(f"✓ GET /api/stations/nearby returned {len(data)} stations within {radius}km")
    
    def test_nearby_stations_with_filters(self):
        """Test nearby stations with various filters (public endpoint)"""
        lat = 51.9244
        lng = 4.4777
        
        # Test with connector type filter
        response = requests.get(
            f"{BASE_URL}/api/stations/nearby",
            params={"lat": lat, "lng": lng, "connector_type": "CCS"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Filter by CCS connector: {len(data)} stations")
        
        # Test with available_only filter
        response = requests.get(
            f"{BASE_URL}/api/stations/nearby",
            params={"lat": lat, "lng": lng, "available_only": True}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Filter by available only: {len(data)} stations")
    
    def test_get_station_detail_public(self):
        """GET /api/stations/{station_id} should work without auth"""
        # First get list of stations to get a valid ID
        response = requests.get(f"{BASE_URL}/api/stations")
        assert response.status_code == 200
        stations = response.json()
        assert len(stations) > 0
        
        station_id = stations[0]["id"]
        
        # Now get the station detail
        response = requests.get(f"{BASE_URL}/api/stations/{station_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == station_id
        assert "chargers" in data
        assert "pricing" in data
        
        print(f"✓ GET /api/stations/{station_id} returned station details")
    
    def test_get_station_pricing_public(self):
        """GET /api/stations/{station_id}/pricing should work without auth"""
        # First get list of stations
        response = requests.get(f"{BASE_URL}/api/stations")
        stations = response.json()
        station_id = stations[0]["id"]
        
        # Get pricing
        response = requests.get(f"{BASE_URL}/api/stations/{station_id}/pricing")
        assert response.status_code == 200
        
        pricing = response.json()
        assert "start_fee_cents" in pricing
        assert "energy_rate_cents_per_kwh" in pricing
        assert "penalty" in pricing
        assert "tax_percent" in pricing
        
        print(f"✓ GET /api/stations/{station_id}/pricing returned pricing info")
    
    def test_get_charger_status_public(self):
        """GET /api/chargers/{charger_id}/status should work without auth"""
        # First get a charger ID
        response = requests.get(f"{BASE_URL}/api/stations")
        stations = response.json()
        charger_id = stations[0]["chargers"][0]["id"]
        
        # Get charger status
        response = requests.get(f"{BASE_URL}/api/chargers/{charger_id}/status")
        assert response.status_code == 200
        
        charger = response.json()
        assert charger["id"] == charger_id
        assert "status" in charger
        assert charger["status"] in ["AVAILABLE", "CHARGING", "COMPLETE", "FAULTED"]
        
        print(f"✓ GET /api/chargers/{charger_id}/status returned charger info")
    
    def test_nfc_resolve_public(self):
        """POST /api/nfc/resolve should work without auth for pricing lookup"""
        # Get a charger's NFC payload
        response = requests.get(f"{BASE_URL}/api/stations")
        stations = response.json()
        nfc_payload = stations[0]["chargers"][0]["nfc_payload"]
        
        # Resolve NFC
        response = requests.post(
            f"{BASE_URL}/api/nfc/resolve",
            json={"nfc_payload": nfc_payload}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "charger" in data
        assert "station" in data
        assert "pricing" in data
        
        print(f"✓ POST /api/nfc/resolve returned charger and pricing info")


class TestAuthRequiredEndpoints:
    """Tests to verify that protected endpoints require authentication"""
    
    def test_sessions_start_requires_auth(self):
        """POST /api/sessions/start should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/sessions/start",
            json={"charger_id": "test-charger"}
        )
        # Should fail without auth
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ POST /api/sessions/start requires authentication")
    
    def test_session_history_requires_auth(self):
        """GET /api/sessions/user/history should require authentication"""
        response = requests.get(f"{BASE_URL}/api/sessions/user/history")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ GET /api/sessions/user/history requires authentication")
    
    def test_user_me_requires_auth(self):
        """GET /api/users/me should require authentication"""
        response = requests.get(f"{BASE_URL}/api/users/me")
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ GET /api/users/me requires authentication")
    
    def test_add_payment_requires_auth(self):
        """POST /api/users/payment-method should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/users/payment-method",
            json={"card_number": "4242424242424242", "expiry": "12/26", "cvv": "123"}
        )
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ POST /api/users/payment-method requires authentication")
    
    def test_nfc_token_provision_requires_auth(self):
        """POST /api/nfc/tokens/provision should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/nfc/tokens/provision",
            json={"device_id": "test-device"}
        )
        assert response.status_code in [401, 403], f"Expected auth error, got {response.status_code}"
        print("✓ POST /api/nfc/tokens/provision requires authentication")


class TestAuthFlow:
    """Test authentication flow for upgrading from guest"""
    
    def test_login_with_valid_credentials(self):
        """Test login with valid test credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "hce-test@example.com", "password": "test123"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "hce-test@example.com"
        
        print("✓ Login with valid credentials succeeded")
        return data["token"]
    
    def test_login_with_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Login with invalid credentials returns 401")
    
    def test_authenticated_session_history(self):
        """Test that authenticated user can access session history"""
        # First login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "hce-test@example.com", "password": "test123"}
        )
        token = login_response.json()["token"]
        
        # Access history with token
        response = requests.get(
            f"{BASE_URL}/api/sessions/user/history",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Authenticated user can access session history ({len(data)} sessions)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
