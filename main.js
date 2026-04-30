const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

require("./backend/server");

// remove File / Edit / etc (menu global)
Menu.setApplicationMenu(null);

function loadConfig() {
  const xml = fs.readFileSync(path.join(__dirname, "config.xml"), "utf-8");

  const getTag = (tag) =>
    xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1];

  return {
    title: getTag("title") || "Electron App",
    width: Number(getTag("width")) || 1000,
    height: Number(getTag("height")) || 700,
    minWidth: Number(getTag("minWidth")) || 800,
    minHeight: Number(getTag("minHeight")) || 500,
  };
}

function createWindow() {
  const config = loadConfig();

  const win = new BrowserWindow({
    width: config.width,
    height: config.height,
    minWidth: config.minWidth,
    minHeight: config.minHeight,
    title: config.title,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // também garante que a barra não apareça na janela
  win.setMenuBarVisibility(false);

  win.loadURL("http://localhost:59823");

  // impede o HTML de sobrescrever o título
  win.on("page-title-updated", (event) => {
    event.preventDefault();
  });

  win.webContents.on("did-finish-load", () => {
    win.setTitle(config.title);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});