const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const SAVED_DIR = path.join(__dirname, 'saved');
const DATA_FILE = path.join(SAVED_DIR, 'vault.enc');

app.use(express.json());
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

// Check if vault file exists
app.get('/api/vault-exists', (req, res) => {
  res.json({ exists: fs.existsSync(DATA_FILE) });
});

// Create master password (first time)
app.post('/api/setup', (req, res) => {
  const { masterPassword } = req.body;
  if (!masterPassword || masterPassword.length < 8) {
    return res.status(400).json({ error: 'Senha mestra precisa ter pelo menos 8 caracteres' });
  }
  if (fs.existsSync(DATA_FILE)) {
    return res.status(400).json({ error: 'Vault já existe' });
  }
  saveVault([], masterPassword);
  res.json({ success: true });
});

// Login (verify master password)
app.post('/api/login', (req, res) => {
  const { masterPassword } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) {
    return res.status(401).json({ error: 'Senha mestra incorreta' });
  }
  res.json({ success: true });
});

// Get all entries
app.post('/api/entries', (req, res) => {
  const { masterPassword } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Não autorizado' });
  res.json(entries);
});

// Add entry
app.post('/api/entries/add', (req, res) => {
  const { masterPassword, entry } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Não autorizado' });
  const newEntry = { id: uuidv4(), ...entry, createdAt: new Date().toISOString() };
  entries.push(newEntry);
  saveVault(entries, masterPassword);
  res.json({ success: true, entry: newEntry });
});

// Delete entry
app.post('/api/entries/delete', (req, res) => {
  const { masterPassword, id } = req.body;
  const entries = loadVault(masterPassword);
  if (entries === null) return res.status(401).json({ error: 'Não autorizado' });
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return res.status(404).json({ error: 'Entrada não encontrada' });
  saveVault(filtered, masterPassword);
  res.json({ success: true });
});

// Generate password
app.get('/api/generate-password', (req, res) => {
  res.json({ password: generatePassword() });
});

app.listen(PORT, () => {
  console.log(`🔐 Vault rodando em http://localhost:${PORT}`);
});