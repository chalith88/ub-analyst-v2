# Market Share Automatic Refresh - Windows Task Scheduler Setup
# Run this script as Administrator to set up quarterly automatic scraping

$taskName = "BankScraper_MarketShareRefresh"
$scriptPath = "$PSScriptRoot\market-share-quarterly-run.ps1"
$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "🔧 Setting up Windows Task Scheduler for quarterly market share updates..." -ForegroundColor Cyan
Write-Host ""

# Create the execution script
$executionScript = @"
# Quarterly Market Share Refresh Execution Script
# This script is called by Windows Task Scheduler

`$ErrorActionPreference = 'Continue'
`$projectRoot = '$projectRoot'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Market Share Quarterly Refresh" -ForegroundColor Cyan
Write-Host "Started: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    Set-Location `$projectRoot
    
    Write-Host "📍 Project directory: `$projectRoot" -ForegroundColor Yellow
    Write-Host "🔄 Running market share scraper..." -ForegroundColor Yellow
    Write-Host ""
    
    # Run the scraper
    npm run market-share:refresh
    
    if (`$LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Market share refresh completed successfully!" -ForegroundColor Green
        Write-Host "   Timestamp: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Market share refresh failed with exit code: `$LASTEXITCODE" -ForegroundColor Red
        exit `$LASTEXITCODE
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ Error during market share refresh:" -ForegroundColor Red
    Write-Host `$_.Exception.Message -ForegroundColor Red
    Write-Host `$_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Completed: `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
"@

# Save execution script
$executionScript | Out-File -FilePath $scriptPath -Encoding UTF8 -Force
Write-Host "✅ Created execution script: $scriptPath" -ForegroundColor Green

# Define task schedule (Quarterly: 15th of Jan, Apr, Jul, Oct at 2:00 AM)
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $projectRoot

# Create trigger for each quarter
$triggers = @()

# Q4 Results (Mid-January)
$triggers += New-ScheduledTaskTrigger -Daily -At 2:00AM -DaysInterval 1
$triggers[0].StartBoundary = [DateTime]::ParseExact("2026-01-15T02:00:00", "yyyy-MM-ddTHH:mm:ss", $null).ToString("yyyy-MM-ddTHH:mm:ss")

# Q1 Results (Mid-April)  
$triggers += New-ScheduledTaskTrigger -Daily -At 2:00AM -DaysInterval 1
$triggers[1].StartBoundary = [DateTime]::ParseExact("2026-04-15T02:00:00", "yyyy-MM-ddTHH:mm:ss", $null).ToString("yyyy-MM-ddTHH:mm:ss")

# Q2 Results (Mid-July)
$triggers += New-ScheduledTaskTrigger -Daily -At 2:00AM -DaysInterval 1
$triggers[2].StartBoundary = [DateTime]::ParseExact("2026-07-15T02:00:00", "yyyy-MM-ddTHH:mm:ss", $null).ToString("yyyy-MM-ddTHH:mm:ss")

# Q3 Results (Mid-October)
$triggers += New-ScheduledTaskTrigger -Daily -At 2:00AM -DaysInterval 1
$triggers[3].StartBoundary = [DateTime]::ParseExact("2026-10-15T02:00:00", "yyyy-MM-ddTHH:mm:ss", $null).ToString("yyyy-MM-ddTHH:mm:ss")

# Task settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

# Register the task
try {
    # Remove existing task if present
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Register new task
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -Principal $principal `
        -Description "Automatically scrapes bank market share data quarterly (Q1, Q2, Q3, Q4 results)" `
        -Force | Out-Null
    
    Write-Host ""
    Write-Host "✅ Task scheduled successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📅 Scheduled Times (all at 2:00 AM):" -ForegroundColor Cyan
    Write-Host "   • January 15 (Q4 results)" -ForegroundColor White
    Write-Host "   • April 15 (Q1 results)" -ForegroundColor White
    Write-Host "   • July 15 (Q2 results)" -ForegroundColor White
    Write-Host "   • October 15 (Q3 results)" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 View task in Task Scheduler:" -ForegroundColor Yellow
    Write-Host "   taskschd.msc" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✏️  To modify schedule:" -ForegroundColor Yellow
    Write-Host "   1. Open Task Scheduler (taskschd.msc)" -ForegroundColor Gray
    Write-Host "   2. Find task: $taskName" -ForegroundColor Gray
    Write-Host "   3. Edit triggers/actions as needed" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🧪 Test the task now:" -ForegroundColor Yellow
    Write-Host "   npm run market-share:refresh" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Failed to register scheduled task:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Make sure you run this script as Administrator" -ForegroundColor Yellow
    exit 1
}
