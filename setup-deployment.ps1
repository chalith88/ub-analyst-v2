# Setup Deployment for Bank Scraper
# This script helps configure git remote and deploy to Railway

Write-Host "🚀 Bank Scraper Deployment Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if git remote exists
$remotes = git remote -v
if (-not $remotes) {
    Write-Host "⚠️  No git remote configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To deploy to Railway, you have two options:" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 1: Connect via GitHub (Recommended)" -ForegroundColor Green
    Write-Host "  1. Create repository at: https://github.com/new" -ForegroundColor Gray
    Write-Host "  2. Run: git remote add origin https://github.com/YOUR_USERNAME/god.git" -ForegroundColor Gray
    Write-Host "  3. Run: git push -u origin master" -ForegroundColor Gray
    Write-Host "  4. Connect Railway to GitHub repo in Railway dashboard" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Option 2: Deploy directly via Railway CLI" -ForegroundColor Green
    Write-Host "  1. Run: npm install -g @railway/cli" -ForegroundColor Gray
    Write-Host "  2. Run: railway login" -ForegroundColor Gray
    Write-Host "  3. Run: railway link" -ForegroundColor Gray
    Write-Host "  4. Run: railway up --service ub-scraper" -ForegroundColor Gray
    Write-Host ""
    
    $choice = Read-Host "Which option would you like? (1 for GitHub, 2 for Railway CLI, Q to quit)"
    
    if ($choice -eq "1") {
        Write-Host ""
        Write-Host "Setting up GitHub remote..." -ForegroundColor Cyan
        $repoUrl = Read-Host "Enter your GitHub repository URL (e.g., https://github.com/username/god.git)"
        
        if ($repoUrl) {
            try {
                git remote add origin $repoUrl
                Write-Host "✅ Remote added successfully!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Next steps:" -ForegroundColor White
                Write-Host "  1. Run: git push -u origin master" -ForegroundColor Gray
                Write-Host "  2. Go to Railway dashboard and connect to GitHub" -ForegroundColor Gray
                Write-Host "  3. Select your repository and set branch to 'master'" -ForegroundColor Gray
            }
            catch {
                Write-Host "❌ Failed to add remote: $_" -ForegroundColor Red
            }
        }
    }
    elseif ($choice -eq "2") {
        Write-Host ""
        Write-Host "Setting up Railway CLI deployment..." -ForegroundColor Cyan
        
        # Check if Railway CLI is installed
        $railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
        
        if (-not $railwayInstalled) {
            Write-Host "Installing Railway CLI..." -ForegroundColor Yellow
            npm install -g @railway/cli
        }
        
        Write-Host ""
        Write-Host "Please run these commands manually:" -ForegroundColor White
        Write-Host "  railway login" -ForegroundColor Gray
        Write-Host "  railway link" -ForegroundColor Gray
        Write-Host "  railway up --service ub-scraper" -ForegroundColor Gray
    }
    else {
        Write-Host "Setup cancelled." -ForegroundColor Yellow
    }
}
else {
    Write-Host "✅ Git remote already configured:" -ForegroundColor Green
    Write-Host $remotes
    Write-Host ""
    
    # Check if we're on master branch
    $branch = git branch --show-current
    Write-Host "Current branch: $branch" -ForegroundColor Cyan
    
    # Check if there are unpushed commits
    $unpushedCommits = git log origin/$branch..$branch --oneline 2>$null
    
    if ($unpushedCommits) {
        Write-Host ""
        Write-Host "⚠️  You have unpushed commits:" -ForegroundColor Yellow
        Write-Host $unpushedCommits
        Write-Host ""
        
        $push = Read-Host "Would you like to push now? (Y/N)"
        if ($push -eq "Y" -or $push -eq "y") {
            git push origin $branch
            Write-Host ""
            Write-Host "✅ Pushed to remote! Railway should auto-deploy if connected." -ForegroundColor Green
        }
    }
    else {
        Write-Host "✅ All commits are pushed to remote" -ForegroundColor Green
        Write-Host ""
        Write-Host "If Railway deployment is still failing:" -ForegroundColor Yellow
        Write-Host "  1. Check Railway dashboard → Deployments → Commit SHA" -ForegroundColor Gray
        Write-Host "  2. Verify it's using commit: 7db7a9e" -ForegroundColor Gray
        Write-Host "  3. Trigger manual redeploy if needed" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "📖 For detailed instructions, see: DEPLOYMENT_INSTRUCTIONS.md" -ForegroundColor Cyan
Write-Host ""
