; Rebrand migration: upgrade GCash POS install slot, remove duplicate CashPOS copies.

!macro SilentUninstallByGuid GUID
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${GUID}" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 _?=$INSTDIR /S' $R1
  ${EndIf}
!macroend

!macro customInit
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\6244FF17-A249-5A52-8228-68B29EE13031" "UninstallString"
  ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FF5C2993-BEAC-56D3-BDDA-634D3D90A7A2" "UninstallString"

  ; GCash + CashPOS both installed — drop the duplicate CashPOS copy.
  ${If} $R1 != ""
  ${AndIf} $R2 != ""
    !insertmacro SilentUninstallByGuid "FF5C2993-BEAC-56D3-BDDA-634D3D90A7A2"
  ${ElseIf} $R1 == ""
  ${AndIf} $R2 != ""
    ; CashPOS-only from first rebrand — replace with legacy upgrade slot.
    !insertmacro SilentUninstallByGuid "FF5C2993-BEAC-56D3-BDDA-634D3D90A7A2"
  ${EndIf}

  ; Very old dev build cleanup.
  !insertmacro SilentUninstallByGuid "3B3EB104-7405-5315-B73D-FBD6E4D29B9F"
!macroend

!macro customInstall
  Delete "$DESKTOP\GCash POS.lnk"
  Delete "$SMPROGRAMS\GCash POS.lnk"
  Delete "$SMPROGRAMS\GCash POS\GCash POS.lnk"
  RMDir "$SMPROGRAMS\GCash POS"
!macroend
