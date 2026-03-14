export const formatCents = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

export const formatCentsPerKwh = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}/kWh`;
};

export const formatCentsPerMinute = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}/min`;
};

export const formatKwh = (kwh: number): string => {
  return `${kwh.toFixed(2)} kWh`;
};

export const formatPower = (kw: number): string => {
  return `${kw.toFixed(1)} kW`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

export const formatCountdown = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
