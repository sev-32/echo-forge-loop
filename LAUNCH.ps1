# ============================================================================
# Echo Forge Loop - Production Launcher (PowerShell)
# ============================================================================
# Starts BOTH the Python backend (port 5002) and Vite frontend (port 5173).
# ============================================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Echo Forge Loop" -ForegroundColor Cyan
Write-Host "  9-Phase AIM-OS Cognition Pipeline" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# ── Check prerequisites ──
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Install frontend deps if needed ──
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── Install backend deps if needed ──
Write-Host "Checking backend dependencies..." -ForegroundColor Yellow
pip install -q -r server/requirements.txt 2>$null

# ── Start backend server in background ──
Write-Host ""
Write-Host "Starting backend (port 5002)..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir/server"
    python main.py
} -ArgumentList $scriptPath

Start-Sleep -Seconds 2

# ── Check backend health ──
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5002/health" -ErrorAction Stop
    Write-Host "  Backend: OK ($($health.pipeline))" -ForegroundColor Green
}
catch {
    Write-Host "  Backend: Starting... (may take a moment)" -ForegroundColor Yellow
}

# ── Start frontend ──
Write-Host "Starting frontend (Vite)..." -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:5002" -ForegroundColor Cyan
Write-Host "  Health:   http://localhost:5002/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

try {
    npm run dev
}
finally {
    Write-Host ""
    Write-Host "Stopping backend..." -ForegroundColor Yellow
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Write-Host "Stopped." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
}
