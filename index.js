const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = 3000;
const SAVED_DIR = path.join(__dirname, 'saved');
const DATA_FILE = path.join(SAVED_DIR, 'vault.enc');

app.use(express.json());
app.get('/', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'public', 'index.html');
    let html = fs.readFileSync(filePath, 'utf8');

    const version = await checkVersion();

    if (version.updateAvailable) {
      const injectScript = `
<style>
    #azurion-update-banner {
        position: fixed;
        top: -100px;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        background: rgba(220, 38, 38, 0.95);
        backdrop-filter: blur(8px);
        color: white;
        padding: 14px 48px 14px 24px;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
        border-bottom: 2px solid #facc15;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    }
    #azurion-update-banner.show { transform: translateY(100px); }
    #azurion-update-banner.hide { opacity: 0; transform: translateY(-100px); pointer-events: none; }
    
    .banner-content { display: flex; align-items: center; gap: 12px; }
    .banner-icon { font-size: 20px; animation: banner-pulse 2s infinite; }
    
    .update-link {
        background: #facc15;
        color: #991b1b;
        padding: 6px 16px;
        border-radius: 9999px;
        text-decoration: none;
        font-weight: bold;
        font-size: 14px;
        transition: all 0.2s ease;
        white-space: nowrap;
    }
    .update-link:hover { background: white; transform: scale(1.05); }

    .close-banner {
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: white;
        font-size: 22px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
        line-height: 1;
    }
    .close-banner:hover { opacity: 1; }

    @keyframes banner-pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
    }
</style>
<script>
(function() {
    console.log("%c ⚠️ New version available! ${version.local} → ${version.remote}", "color: #dc2626; font-weight: bold;");
    if (document.getElementById('azurion-update-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'azurion-update-banner';
    banner.innerHTML = \`
        <div class="banner-content">
            <span class="banner-icon">🚀</span>
            <span>A new version of <strong>Azurion Bank</strong> (${version.remote}) is available.</span>
            <a href="https://github.com/azuriondeve/AzurionBankofPasswords/releases" 
               target="_blank" class="update-link">Update Now</a>
        </div>
        <button class="close-banner" onclick="this.parentElement.classList.add('hide')" title="Close">&times;</button>\`;

    document.body.prepend(banner);
    setTimeout(() => banner.classList.add('show'), 100);
})();
</script>
      `;

      html = html.replace('</body>', injectScript + '</body>');
    }

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading page');
  }
});
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(SAVED_DIR)) fs.mkdirSync(SAVED_DIR, { recursive: true });

// Derive encryption key from master password
function deriveKey(masterPassword) {
  return crypto.scryptSync(masterPassword, 'vault-salt-2024', 32);
}

// Encrypt data
function encrypt(data, masterPassword) {
  const key = deriveKey(masterPassword);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt data
function decrypt(encryptedData, masterPassword) {
  try {
    const key = deriveKey(masterPassword);
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

// Load vault
function loadVault(masterPassword) {
  if (!fs.existsSync(DATA_FILE)) return [];
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  return decrypt(content, masterPassword) || null;
}

// Save vault
function saveVault(entries, masterPassword) {
  const encrypted = encrypt(entries, masterPassword);
  fs.writeFileSync(DATA_FILE, encrypted, 'utf8');
}

// Generate secure password (15-30 chars)
function generatePassword() {
  const length = Math.floor(Math.random() * 16) + 15; // 15-30
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + digits + symbols;

  let password = '';
  // Guarantee at least 3 of each type
  for (let i = 0; i < 3; i++) password += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 3; i++) password += lower[Math.floor(Math.random() * lower.length)];
  for (let i = 0; i < 3; i++) password += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 3; i++) password += symbols[Math.floor(Math.random() * symbols.length)];

  while (password.length < length) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function checkVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const localVersion = pkg.version;

    const response = await fetch('https://raw.githubusercontent.com/azuriondeve/AzurionBankofPasswords/main/version.json');

    if (!response.ok) {
      throw new Error('Error retrieving remote version.');
    }

    const remoteData = await response.json();
    const remoteVersion = remoteData.ver;

    return {
      local: localVersion,
      remote: remoteVersion,
      updateAvailable: localVersion !== remoteVersion
    };
  } catch (err) {
    console.error(err);
    return { error: err.message };
  }
}

// Check if vault file exists
app.get('/api/vault-exists', (req, res) => {
  res.json({ exists: fs.existsSync(DATA_FILE) });
});

app.get('/api/version-check', async (req, res) => {
  const result = await checkVersion();
  res.json(result);
});

// Create master password (first time)
app.post('/api/setup', (req, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword || masterPassword.length < 8) {
    return res.status(400).json({ error: 'The master password must be at least 8 characters long.' });
  }
  if (fs.existsSync(DATA_FILE)) {
    return res.status(400).json({ error: 'The vault already exists its not possible to create more than one.' });
  }
  saveVault([], masterPassword);
  res.json({ success: true });
});

// Login (verify master password)
app.post('/api/login', (req, res) => {
  const { masterPassword } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) {
    return res.status(401).json({ error: 'Incorrect master password' });
  }
  res.json({ success: true });
});

// Get all entries
app.post('/api/entries', (req, res) => {
  const { masterPassword } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Unauthorized' });
  res.json(entries);
});

// Add entry
app.post('/api/entries/add', (req, res) => {
  const { masterPassword, entry } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Unauthorized' });
  const newEntry = { id: uuidv4(), ...entry, createdAt: new Date().toISOString() };
  entries.push(newEntry);
  saveVault(entries, masterPassword);
  res.json({ success: true, entry: newEntry });
});

// Delete entry
app.post('/api/entries/delete', (req, res) => {
  const { masterPassword, id } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Unauthorized' });
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return res.status(404).json({ error: 'Entrada não encontrada' });
  saveVault(filtered, masterPassword);
  res.json({ success: true });
});

// Generate password
app.get('/api/generate-password', (req, res) => {
  res.json({ password: generatePassword() });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Running http://localhost:${PORT}`);
});