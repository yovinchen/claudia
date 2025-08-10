/**
 * Formats a Unix timestamp to a human-readable date string
 * @param timestamp - Unix timestamp in seconds
 * @param locale - Optional locale string (e.g., 'en-US', 'zh-CN')
 * @returns Formatted date string
 * 
 * @example
 * formatUnixTimestamp(1735555200) // "Dec 30, 2024"
 * formatUnixTimestamp(1735555200, "zh-CN") // "12月30日, 2024年"
 */
export function formatUnixTimestamp(timestamp: number, locale?: string): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const effectiveLocale = locale || navigator.language || 'en-US';
  const isZhCN = effectiveLocale.startsWith('zh');
  
  // If it's today, show time
  if (isToday(date)) {
    return formatTime(date, effectiveLocale);
  }
  
  // If it's yesterday
  if (isYesterday(date)) {
    const yesterdayLabel = isZhCN ? '昨天' : 'Yesterday';
    return `${yesterdayLabel}, ${formatTime(date, effectiveLocale)}`;
  }
  
  // If it's within the last week, show day of week
  if (isWithinWeek(date)) {
    return `${getDayName(date, effectiveLocale)}, ${formatTime(date, effectiveLocale)}`;
  }
  
  // If it's this year, don't show year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(effectiveLocale, { 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  // Otherwise show full date
  return date.toLocaleDateString(effectiveLocale, { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Formats an ISO timestamp string to a human-readable date
 * @param isoString - ISO timestamp string
 * @param locale - Optional locale string (e.g., 'en-US', 'zh-CN')
 * @returns Formatted date string
 * 
 * @example
 * formatISOTimestamp("2025-01-04T10:13:29.000Z") // "Jan 4, 2025"
 * formatISOTimestamp("2025-01-04T10:13:29.000Z", "zh-CN") // "1月4日, 2025"
 */
export function formatISOTimestamp(isoString: string, locale?: string): string {
  const date = new Date(isoString);
  const effectiveLocale = locale || navigator.language || 'en-US';
  return formatUnixTimestamp(Math.floor(date.getTime() / 1000), effectiveLocale);
}

/**
 * Truncates text to a specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Gets the first line of text
 * @param text - Text to process
 * @returns First line of text
 */
export function getFirstLine(text: string): string {
  const lines = text.split('\n');
  return lines[0] || '';
}

// Helper functions
function formatTime(date: Date, locale?: string): string {
  const effectiveLocale = locale || navigator.language || 'en-US';
  const isZhCN = effectiveLocale.startsWith('zh');
  
  return date.toLocaleTimeString(effectiveLocale, { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: !isZhCN // Chinese typically uses 24-hour format
  });
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

function isWithinWeek(date: Date): boolean {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return date > weekAgo;
}

function getDayName(date: Date, locale?: string): string {
  const effectiveLocale = locale || navigator.language || 'en-US';
  return date.toLocaleDateString(effectiveLocale, { weekday: 'long' });
}

/**
 * Formats a timestamp to a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @param locale - Optional locale string (e.g., 'en-US', 'zh-CN')
 * @returns Relative time string
 * 
 * @example
 * formatTimeAgo(Date.now() - 3600000) // "1 hour ago"
 * formatTimeAgo(Date.now() - 86400000, "zh-CN") // "1小时前"
 */
export function formatTimeAgo(timestamp: number, locale?: string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const effectiveLocale = locale || navigator.language || 'en-US';
  const isZhCN = effectiveLocale.startsWith('zh');
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (isZhCN) {
    if (years > 0) {
      return `${years}年前`;
    }
    if (months > 0) {
      return `${months}个月前`;
    }
    if (weeks > 0) {
      return `${weeks}周前`;
    }
    if (days > 0) {
      return `${days}天前`;
    }
    if (hours > 0) {
      return `${hours}小时前`;
    }
    if (minutes > 0) {
      return `${minutes}分钟前`;
    }
    if (seconds > 0) {
      return `${seconds}秒前`;
    }
    return '刚刚';
  } else {
    if (years > 0) {
      return years === 1 ? '1 year ago' : `${years} years ago`;
    }
    if (months > 0) {
      return months === 1 ? '1 month ago' : `${months} months ago`;
    }
    if (weeks > 0) {
      return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    }
    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`;
    }
    if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    if (minutes > 0) {
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    }
    if (seconds > 0) {
      return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`;
    }
    return 'just now';
  }
} 
