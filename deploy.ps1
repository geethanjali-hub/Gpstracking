# Deploy script for Windows PowerShell
# 1️⃣ Install Node 22 (if not already installed)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Downloading Node 22 MSI..."
    $nodeUrl = "https://nodejs.org/dist/v22.0.0/node-v22.0.0-x64.msi"
    $tmp = "$env:TEMP\node22.msi"
    Invoke-WebRequest $nodeUrl -OutFile $tmp
    Start-Process msiexec.exe -ArgumentList "/i `"$tmp`" /quiet /norestart" -Wait
    Remove-Item $tmp
}
# Ensure npm is on PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
# 2️⃣ Install pm2 globally
npm install -g pm2
# 3️⃣ Clean install dependencies (ignore optional native binaries)
Set-Location "$HOME\gps_project"
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm ci --ignore-optional
# 4️⃣ Build the frontend (ignore optional binaries)
Set-Location "$HOME\gps_project\frontend"
npm ci --ignore-optional
npm run build
# 5️⃣ Copy the build output to project root
Copy-Item -Recurse -Force .\dist\* "$HOME\gps_project\dist\"
Copy-Item -Recurse -Force .\dist\* "$HOME\gps_project\public\"
# 6️⃣ Restart services with pm2
Set-Location "$HOME\gps_project\backend"
pm2 delete all -f
pm2 start .\server.js --name gps-backend
pm2 save
pm2 list

