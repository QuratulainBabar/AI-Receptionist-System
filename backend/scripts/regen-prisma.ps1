$lines = netstat -ano | Select-String ":4000\s+.*LISTENING"
foreach ($line in $lines) {
  $procId = ($line.ToString() -split "\s+")[-1]
  if ($procId -match "^\d+$") {
    Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2
Set-Location "E:\AI-Receptionist-System\backend"
npx prisma generate 2>&1 | Out-File "E:\AI-Receptionist-System\backend\scripts\generate-out.txt" -Encoding utf8
Get-Content "E:\AI-Receptionist-System\backend\scripts\generate-out.txt"
