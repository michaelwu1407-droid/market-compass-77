# How to Start the Web Server

## Option 1: Using VS Code Terminal (Recommended)

1. **Open VS Code** in this folder
2. **Open Terminal** (Press `Ctrl + ~` or go to Terminal → New Terminal)
3. **Run these commands:**
   ```bash
   npm install
   npm run dev
   ```
4. **Wait for it to say:** `Local: http://localhost:8080/`
5. **Open your browser** to: `http://localhost:8080/admin`

## Option 2: Using Command Prompt or PowerShell

1. **Open Command Prompt or PowerShell**
2. **Navigate to the project folder:**
   ```powershell
   cd "C:\Users\micha\OneDrive\Documents\market-compass-77"
   ```
3. **Install dependencies:**
   ```powershell
   npm install
   ```
4. **Start the server:**
   ```powershell
   npm run dev
   ```
5. **Open your browser** to: `http://localhost:8080/admin`

## Option 3: If Node.js is Not Installed

If you get an error that `npm` is not recognized:

1. **Download and install Node.js:**
   - Go to: https://nodejs.org/
   - Download the LTS version (recommended)
   - Install it (this will add npm to your PATH)
   - Restart your terminal/VS Code

2. **Then follow Option 1 or 2 above**

## What You Should See

When the server starts successfully, you'll see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:8080/
  ➜  Network: http://192.168.x.x:8080/
```

Then open: **http://localhost:8080/admin**

## Troubleshooting

- **Port 8080 already in use?** The server will try a different port automatically
- **Still can't connect?** Make sure no firewall is blocking port 8080
- **Dependencies error?** Delete `node_modules` folder and `package-lock.json`, then run `npm install` again

