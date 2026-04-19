const QRCode = require('qrcode');
const os = require('os');

const normalizeUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
};

const isLocalHostname = (hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname);

const isPrivateIpv4 = (hostname) => {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }

  const [a, b] = hostname.split('.').map(Number);

  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
};

const isReachableFrontendUrl = (value) => {
  const normalizedValue = normalizeUrl(value);

  if (!/^https?:\/\//i.test(normalizedValue)) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const hostname = parsedUrl.hostname.toLowerCase();

    return !isLocalHostname(hostname);
  } catch (error) {
    return false;
  }
};

const withCurrentLanIp = (value) => {
  const normalizedValue = normalizeUrl(value);

  if (!normalizedValue) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!isPrivateIpv4(hostname)) {
      return normalizedValue;
    }

    const localNetworkIp = getLocalNetworkIp();

    if (!localNetworkIp || localNetworkIp === hostname) {
      return normalizedValue;
    }

    parsedUrl.hostname = localNetworkIp;
    return parsedUrl.toString().replace(/\/$/, '');
  } catch (error) {
    return normalizedValue;
  }
};

const getLocalNetworkIp = () => {
  const interfaces = os.networkInterfaces();

  for (const networkInterface of Object.values(interfaces)) {
    for (const address of networkInterface || []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
};

const resolveFrontendUrl = (frontendUrlOverride) => {
  const normalizedOverride = normalizeUrl(frontendUrlOverride);

  if (isReachableFrontendUrl(normalizedOverride)) {
    return normalizedOverride;
  }

  const configuredFrontendUrl = normalizeUrl(
    process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL
  );
  const currentConfiguredFrontendUrl = withCurrentLanIp(configuredFrontendUrl);

  if (isReachableFrontendUrl(currentConfiguredFrontendUrl)) {
    return currentConfiguredFrontendUrl;
  }

  const frontendUrl = (() => {
    const localNetworkIp = getLocalNetworkIp();
    return localNetworkIp ? `http://${localNetworkIp}:3000` : 'http://localhost:3000';
  })();

  return frontendUrl;
};

const getTableMenuUrl = (tableData, frontendUrlOverride) => {
  const frontendUrl = resolveFrontendUrl(frontendUrlOverride);
  return `${frontendUrl}/customer/menu/${tableData.hotel_id}?table=${tableData.id}`;
};

const generateQRCode = async (tableData, frontendUrlOverride) => {
  try {
    const qrData = getTableMenuUrl(tableData, frontendUrlOverride);

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

const generateQRCodeBuffer = async (tableData, frontendUrlOverride) => {
  try {
    const qrData = getTableMenuUrl(tableData, frontendUrlOverride);

    // Generate QR code as buffer
    const buffer = await QRCode.toBuffer(qrData, {
      width: 300,
      margin: 2
    });

    return buffer;
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw error;
  }
};

module.exports = {
  generateQRCode,
  generateQRCodeBuffer,
  getTableMenuUrl
};
