const { execSync } = require('child_process');

// Get local IP dynamically, fall back to env var or localhost
function getLocalIp() {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  try {
    // Windows: get the first non-loopback IPv4
    const result = execSync(
      'powershell -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notmatch \'127\' -and $_.IPAddress -notmatch \'169\'} | Select-Object -First 1 -ExpandProperty IPAddress)"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    if (result) return `http://${result}:8001`;
  } catch {
    // ignore
  }
  return 'http://localhost:8001';
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: getLocalIp(),
  },
});
