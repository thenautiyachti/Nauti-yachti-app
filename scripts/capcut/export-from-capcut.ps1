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
#   0  {"exported": "<path to mp4>"}       then run blur-bars.js on it
#   3  {"skipped": "CapCut is open"}        he is using it; try next run
#   4  {"skipped": "owner active"}          input in the last 10 minutes; try next run
#   1  {"error": "...", "shots": "<dir>"}   report it with the screenshots; never improvise clicks
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
param([Parameter(Mandatory = $true)][string]$Project, [int]$IdleMinutes = 10,
      [string]$ShotDir = (Join-Path $env:TEMP "capcut-export"))
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
public struct RECT { public int L, T, R, B; }
public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
'@
}
[CapEx.W]::SetProcessDPIAware() | Out-Null
New-Item -ItemType Directory -Force $ShotDir | Out-Null
Get-ChildItem $ShotDir -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force
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
function Big() { Wins | Where-Object { $_.W -ge 1200 -and $_.Ht -ge 700 } | Select-Object -First 1 }
function ClosePopups() {
  foreach ($w in (Wins | Where-Object { $_.W -lt 1200 -or $_.Ht -lt 700 })) {
    [CapEx.W]::PostMessage($w.H, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  }
  Start-Sleep -Milliseconds 500
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
$li = New-Object CapEx.W+LASTINPUTINFO; $li.cbSize = 8; [CapEx.W]::GetLastInputInfo([ref]$li) | Out-Null
# Both clocks are 32-bit milliseconds since boot and wrap after 49.7 days.
$now = [int64][Environment]::TickCount; if ($now -lt 0) { $now += 4294967296 }
$ms = $now - [int64]$li.dwTime; if ($ms -lt 0) { $ms += 4294967296 }
if ($ms / 60000 -lt $IdleMinutes) { Say 4 @{ skipped = "owner active"; idleMinutes = [math]::Round($ms / 60000, 1) } }

$videos = Join-Path $env:LOCALAPPDATA "CapCut\Videos"
$started = Get-Date
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
  Say 0 @{ exported = $file }
} catch {
  try { Shot "error" } catch {}
  EndCapCut
  Say 1 @{ error = $_.Exception.Message; shots = $ShotDir }
}
