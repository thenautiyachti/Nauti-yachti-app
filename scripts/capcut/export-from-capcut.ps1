# Export one Claude-built CapCut project to mp4 by driving CapCut's own Export
# button, the way the owner would. Added 5 Oct 2026, when he said exporting is
# the crew's job: "You should be able to do all the cap cuts and music and video
# stuff". capcut-cli's own export is macOS-only and its render is a low-res
# proxy; CapCut's Export keeps the music licensed through CapCut.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File export-from-capcut.ps1 -Project "Swim Stop compilation 2026-10-05"
#
# -Project is the project name WITHOUT " (Claude)" (searched as typed, so make it
# specific enough that it is the first card). Prints one JSON line and exits:
#   0  {"exported": "<path to mp4>", "shots": "<dir>"}   then run blur-bars.js on it
#   3  {"skipped": "CapCut is open"}        he is using it; try next run
#   4  {"skipped": "owner active"}          he pressed Not now, or kept using the PC for 3 minutes
#   4  {"skipped": "PC locked"}             the lock screen is up; nothing can be clicked
#   1  {"error": "...", "shots": "<dir>"}   report it with the screenshots; never improvise clicks
#
# Screenshots (5 Oct 2026): each run keeps its own folder,
# %TEMP%\capcut-export\<yyyyMMdd-HHmmss>-<project>, named in the JSON, so a failed
# export in a queue keeps its evidence when the next one runs. Run folders older
# than 7 days are removed; no other run's folder is touched.
#
# What it learned the hard way (5 Oct 2026):
# - CapCut is Qt/QML and exposes no buttons to Windows automation, so clicks are
#   by position. Every position here is measured from CapCut's own window, so it
#   works on either monitor; the home and editor layouts were measured at
#   1920x1080 (home 1920x1040 unmaximised, editor maximised).
# - Promotions ("CapCut Pro", "CapCut Ultra is live", "Turn on notifications?")
#   open as separate small windows, at random, and swallow clicks. They are
#   closed with a close message, never by clicking, before every step.
# - A background process may only take the foreground after an Alt tap;
#   otherwise Windows silently refuses every cursor move (another window, e.g.
#   GameInputSvc, holds the foreground).
# - The "share it now" panel after an export is closed, never Shared.
# THE COUNTDOWN OVERLAY (owner, 11 Oct 2026): "it would be cool to have a little
# overlay appear stating Nauti Coral is about to perform some media/capcut
# actions so it allows me to not use the computer. once the overlay start it
# should do a 30 second countdown or something and then start her task."
# It replaces the silent two-idle-minutes rule: a topmost panel counts down 30
# seconds; any mouse or keyboard input starts it again; "Not now", or 3 minutes
# of him still working, postpones (exit 4). During the export a click-through
# banner at the bottom says hands off. Neither can take a click CapCut needs.
param([string]$Project = "", [int]$IdleMinutes = 2, [switch]$OverlayTest,
      [string]$ShotRoot = (Join-Path $env:TEMP "capcut-export"))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
if (-not ([System.Management.Automation.PSTypeName]'CapEx.W').Type) {
Add-Type -Namespace CapEx -Name W -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
[DllImport("user32.dll")] public static extern int GetWindowLong(System.IntPtr h, int i);
[DllImport("user32.dll")] public static extern int SetWindowLong(System.IntPtr h, int i, int v);
public struct RECT { public int L, T, R, B; }
public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
'@
}
[CapEx.W]::SetProcessDPIAware() | Out-Null
# This run's own screenshot folder; it is made only when CapCut is started.
$safe = ($Project -replace '[^A-Za-z0-9._-]+', '_').Trim('_')
if ($safe.Length -gt 60) { $safe = $safe.Substring(0, 60) }
$ShotDir = Join-Path $ShotRoot ("{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $safe)
$step = 0
function Say([int]$code, $obj) { Write-Output ($obj | ConvertTo-Json -Compress); exit $code }

# Every visible top-level window belonging to CapCut, with its size.
function Wins() {
  $ids = @(Get-Process CapCut -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id })
  $list = New-Object System.Collections.ArrayList
  $cb = [CapEx.W+EnumProc]{ param($h, $l)
    $p = [uint32]0; [CapEx.W]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
    if ($ids -contains $p -and [CapEx.W]::IsWindowVisible($h)) {
      $r = New-Object CapEx.W+RECT; [CapEx.W]::GetWindowRect($h, [ref]$r) | Out-Null
      [void]$list.Add([pscustomobject]@{ H = $h; L = $r.L; T = $r.T; W = $r.R - $r.L; Ht = $r.B - $r.T })
    }
    return $true }
  [CapEx.W]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
  $list
}
function Pump() { try { [System.Windows.Forms.Application]::DoEvents() } catch {} }
function Big() { Wins | Where-Object { $_.W -ge 1200 -and $_.Ht -ge 700 } | Select-Object -First 1 }
function ClosePopups() {
  foreach ($w in (Wins | Where-Object { $_.W -lt 1200 -or $_.Ht -lt 700 })) {
    [CapEx.W]::PostMessage($w.H, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  }
  Start-Sleep -Milliseconds 500
  Pump
}
function Front($w) {
  [CapEx.W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [CapEx.W]::SetForegroundWindow($w.H) | Out-Null
  [CapEx.W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 300
}
# Click at a position measured from the main window's top-left corner.
# -Keep: do not close small windows first. The export dialog and the share
# panel are small windows too, and closing "pop-ups" before clicking Export in
# the dialog shut the dialog itself (found testing, 5 Oct 2026).
function Rel([int]$x, [int]$y, [switch]$Keep) {
  if (-not $Keep) { ClosePopups }
  $w = Big; if (-not $w) { throw "CapCut's window is gone" }
  Front $w
  $o = if ([CapEx.W]::IsZoomed($w.H)) { 8 } else { 0 }   # a maximised window overhangs by 8px
  if (-not [CapEx.W]::SetCursorPos($w.L + $o + $x, $w.T + $o + $y)) { throw "the cursor could not be moved (another window holds the foreground)" }
  Start-Sleep -Milliseconds 150
  [CapEx.W]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero); [CapEx.W]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero)
}
function Keys([string]$k) { $w = Big; if ($w) { Front $w }; [System.Windows.Forms.SendKeys]::SendWait($k) }
# Only CapCut's own window is captured, never the rest of the screen.
function Shot([string]$what) {
  $script:step++
  $w = Big; if (-not $w) { return }
  $bmp = New-Object System.Drawing.Bitmap $w.W, $w.Ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($w.L, $w.T, 0, 0, (New-Object System.Drawing.Size $w.W, $w.Ht))
  $small = New-Object System.Drawing.Bitmap $bmp, ([int]($w.W / 2)), ([int]($w.Ht / 2))
  $small.Save((Join-Path $ShotDir ("{0:D2}-{1}.png" -f $script:step, $what)), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $small.Dispose()
}
function EndCapCut() {
  foreach ($i in 1..2) { $w = Big; if ($w) { [CapEx.W]::PostMessage($w.H, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Start-Sleep -Seconds 4 } }
  # Its helper processes take a few seconds to go, and the next run refuses to
  # start while any CapCut process exists.
  foreach ($i in 1..5) {
    if (-not (Get-Process CapCut -ErrorAction SilentlyContinue)) { break }
    Get-Process CapCut -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

if (Get-Process CapCut -ErrorAction SilentlyContinue) { Say 3 @{ skipped = "CapCut is open" } }
# The lock screen: nothing can be clicked or captured (11 Oct 2026, a run failed this way).
# Only THIS session's lock screen: other Windows accounts signed in on this PC
# have their own LogonUI (11 Oct 2026: session 3 read as locked while his was not).
$mySession = (Get-Process -Id $PID).SessionId
if (Get-Process LogonUI -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $mySession }) { Say 4 @{ skipped = "PC locked" } }

function LastInput() {
  $li = New-Object CapEx.W+LASTINPUTINFO; $li.cbSize = 8; [CapEx.W]::GetLastInputInfo([ref]$li) | Out-Null
  return [uint32]$li.dwTime
}
function Countdown([int]$Seconds = 30, [int]$MaxWaitSeconds = 180) {
  $f = New-Object System.Windows.Forms.Form
  $f.FormBorderStyle = "None"; $f.StartPosition = "CenterScreen"; $f.TopMost = $true; $f.ShowInTaskbar = $false
  $f.Size = New-Object System.Drawing.Size(620, 250); $f.BackColor = [System.Drawing.Color]::FromArgb(18, 12, 30); $f.Opacity = 0.96
  $t1 = New-Object System.Windows.Forms.Label; $t1.Text = "Nauti Coral is about to use CapCut"
  $t1.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold); $t1.ForeColor = [System.Drawing.Color]::FromArgb(203, 108, 230)
  $t1.AutoSize = $false; $t1.TextAlign = "MiddleCenter"; $t1.SetBounds(10, 22, 600, 40)
  $t2 = New-Object System.Windows.Forms.Label; $t2.Text = "Please don't use the mouse or keyboard while she exports a video."
  $t2.Font = New-Object System.Drawing.Font("Segoe UI", 11); $t2.ForeColor = [System.Drawing.Color]::White
  $t2.AutoSize = $false; $t2.TextAlign = "MiddleCenter"; $t2.SetBounds(10, 70, 600, 26)
  $t3 = New-Object System.Windows.Forms.Label; $t3.Font = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold)
  $t3.ForeColor = [System.Drawing.Color]::White; $t3.AutoSize = $false; $t3.TextAlign = "MiddleCenter"; $t3.SetBounds(10, 104, 600, 56)
  $b = New-Object System.Windows.Forms.Button; $b.Text = "Not now"; $b.SetBounds(255, 182, 110, 36)
  $b.FlatStyle = "Flat"; $b.ForeColor = [System.Drawing.Color]::White; $b.Font = New-Object System.Drawing.Font("Segoe UI", 10)
  $f.Controls.AddRange(@($t1, $t2, $t3, $b))
  $script:cdResult = "go"; $script:cdLeft = $Seconds; $script:cdWaited = 0; $script:cdLast = LastInput
  $b.Add_Click({ $script:cdResult = "later"; $f.Close() })
  $tm = New-Object System.Windows.Forms.Timer; $tm.Interval = 1000
  $tm.Add_Tick({
    $script:cdWaited++
    $li = LastInput
    if ($li -ne $script:cdLast) { $script:cdLast = $li; $script:cdLeft = $Seconds; $t2.Text = "You're using the PC, so the countdown starts again when you stop." }
    else { $script:cdLeft--; $t2.Text = "Please don't use the mouse or keyboard while she exports a video." }
    $t3.Text = "Starting in " + $script:cdLeft + "s"
    if ($script:cdLeft -le 0) { $tm.Stop(); $f.Close() }
    elseif ($script:cdWaited -ge $MaxWaitSeconds) { $script:cdResult = "later"; $tm.Stop(); $f.Close() }
  })
  $t3.Text = "Starting in " + $Seconds + "s"
  $f.Add_Shown({ $tm.Start() })
  [void]$f.ShowDialog()
  $tm.Dispose(); $f.Dispose()
  return $script:cdResult
}
function Banner() {
  $f = New-Object System.Windows.Forms.Form
  $f.FormBorderStyle = "None"; $f.TopMost = $true; $f.ShowInTaskbar = $false; $f.StartPosition = "Manual"
  $f.BackColor = [System.Drawing.Color]::FromArgb(18, 12, 30); $f.Opacity = 0.88
  $sc = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $f.SetBounds([int]($sc.Width / 2 - 330), $sc.Height - 96, 660, 40)
  $l = New-Object System.Windows.Forms.Label; $l.Text = "Nauti Coral is exporting in CapCut, hands off the mouse and keyboard"
  $l.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold); $l.ForeColor = [System.Drawing.Color]::White
  $l.AutoSize = $false; $l.TextAlign = "MiddleCenter"; $l.Dock = "Fill"; $f.Controls.Add($l)
  [void]$f.Handle
  # Click-through (WS_EX_TRANSPARENT | WS_EX_LAYERED), never activated
  # (WS_EX_NOACTIVATE), so it cannot take a click meant for CapCut.
  $ex = [CapEx.W]::GetWindowLong($f.Handle, -20)
  [CapEx.W]::SetWindowLong($f.Handle, -20, ($ex -bor 0x20 -bor 0x80000 -bor 0x08000000)) | Out-Null
  [CapEx.W]::ShowWindow($f.Handle, 8) | Out-Null    # SW_SHOWNA
  $f.TopMost = $true
  [System.Windows.Forms.Application]::DoEvents()
  return $f
}

# -OverlayTest: show the countdown (10s) and the banner (8s), touch nothing else.
if ($OverlayTest) {
  $r = Countdown -Seconds 10
  if ($r -eq "go") { $bn = Banner; foreach ($i in 1..16) { Start-Sleep -Milliseconds 500; Pump }; $bn.Close() }
  Say 0 @{ overlayTest = $r }
}
if (-not $Project) { Say 1 @{ error = "-Project is required" } }
if ((Countdown) -ne "go") { Say 4 @{ skipped = "owner active" } }
$script:banner = Banner

$videos = Join-Path $env:LOCALAPPDATA "CapCut\Videos"
$started = Get-Date
New-Item -ItemType Directory -Force $ShotDir | Out-Null
# A week of evidence is kept: older run folders go, and so do loose screenshots
# from before runs had folders of their own.
$cutoff = (Get-Date).AddDays(-7)
Get-ChildItem $ShotRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d{8}-\d{6}-' -and $_.LastWriteTime -lt $cutoff } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $ShotRoot -File -Filter *.png -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force -ErrorAction SilentlyContinue
try {
  Start-Process (Join-Path $env:LOCALAPPDATA "CapCut\Apps\CapCut.exe")
  $t = 0; while (-not (Big) -and $t -lt 60) { Start-Sleep -Seconds 2; $t += 2; ClosePopups }
  $hw = Big; if (-not $hw) { throw "CapCut did not open its home window" }
  foreach ($i in 1..4) { Start-Sleep -Seconds 2; ClosePopups }   # promotions arrive a few seconds late
  $hw = Big
  if ($hw.W -lt 1800 -or $hw.Ht -lt 1000) { [CapEx.W]::ShowWindow($hw.H, 3) | Out-Null; Start-Sleep -Seconds 2 }
  Shot "home"
  # Projects search: the magnifier, then the box it opens; the first card below.
  Rel 1617 693; Start-Sleep -Milliseconds 800
  Rel 1500 693; Keys "^a"
  Keys ($Project -replace '([+^%~(){}\[\]])', '{$1}'); Start-Sleep -Milliseconds 400; Keys "{ENTER}"; Start-Sleep -Seconds 2
  Shot "search"
  $homeH = (Big).H
  Rel 307 780
  # Opening a project replaces the home window with the editor.
  $t = 0; do { Start-Sleep -Seconds 2; $t += 2; ClosePopups; $ed = Big } while ((-not $ed -or $ed.H -eq $homeH) -and $t -lt 90)
  if (-not $ed -or $ed.H -eq $homeH) { Shot "no-editor"; throw "the project did not open (did the search find it?)" }
  [CapEx.W]::ShowWindow($ed.H, 3) | Out-Null
  Start-Sleep -Seconds 8; ClosePopups
  Shot "editor"
  Rel 1768 17; Start-Sleep -Seconds 3                   # Export, top right (pop-ups closed first)
  Shot "export-dialog"
  Rel 1187 823 -Keep                                    # Export, in the dialog
  $t = 0; $file = $null
  while ($t -lt 300 -and -not $file) {
    Start-Sleep -Seconds 3; $t += 3
    $c = Get-ChildItem $videos -Filter *.mp4 -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $started } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($c) { $s1 = $c.Length; Start-Sleep -Seconds 3; $t += 3; if ((Get-Item $c.FullName).Length -eq $s1 -and $s1 -gt 0) { $file = $c.FullName } }
  }
  Shot "after-export"
  EndCapCut
  if (-not $file) { throw "no exported file appeared within 5 minutes" }
  if ($script:banner) { $script:banner.Close() }
  Say 0 @{ exported = $file; shots = $ShotDir }
} catch {
  try { Shot "error" } catch {}
  EndCapCut
  if ($script:banner) { $script:banner.Close() }
  Say 1 @{ error = $_.Exception.Message; shots = $ShotDir }
}
