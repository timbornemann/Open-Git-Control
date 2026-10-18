!macro customInstall
  CreateShortCut "$SMPROGRAMS\Open-Git-Control Recovery (installed).lnk" "$INSTDIR\Open-Git-Control-Recovery.exe" '--installation "$INSTDIR"' "$INSTDIR\Open-Git-Control-Recovery.exe" 0
!macroend

!macro customUnInstall
  ; This shortcut belongs to the installed copy. The retained recovery copy
  ; maintains its own shortcut and is deliberately not removed on downgrade.
  Delete "$SMPROGRAMS\Open-Git-Control Recovery (installed).lnk"
!macroend
