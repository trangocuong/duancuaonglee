/**
 * LAN Helpers — Phát hiện và kiểm tra địa chỉ IP mạng nội bộ (Private Subnet)
 */

import os from "node:os";

/**
 * Kiểm tra xem một IP có phải là IP nội bộ / LAN (Private IPv4 hoặc Loopback) hay không.
 * Các dải Private IPv4 chuẩn theo RFC 1918:
 *  - 10.0.0.0 - 10.255.255.255 (10.0.0.0/8)
 *  - 172.16.0.0 - 172.31.255.255 (172.16.0.0/12)
 *  - 192.168.0.0 - 192.168.255.255 (192.168.0.0/16)
 *  - 127.0.0.0 - 127.255.255.255 (127.0.0.0/8 - loopback)
 *  - 169.254.0.0 - 169.254.255.255 (Link-local)
 *  - ::1, ::ffff:127.0.0.1 (IPv6 Loopback)
 */
export function isPrivateLanIp(ipString) {
  if (!ipString) return false;
  let ip = String(ipString).trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  if (ip === "localhost" || ip === "::1" || ip === "127.0.0.1") return true;

  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const numParts = parts.map(Number);
  if (numParts.some(isNaN)) return false;

  const [a, b] = numParts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private Network)
  if (a === 10) return true;

  // 192.168.0.0/16 (Private Network thông dụng trong gia đình/văn phòng)
  if (a === 192 && b === 168) return true;

  // 172.16.0.0 - 172.31.255.255 (Private Network)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;

  return false;
}

/**
 * Lấy danh sách tất cả các địa chỉ IPv4 LAN của máy hiện tại để hiển thị cho người dùng
 */
export function getLocalLanIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}
