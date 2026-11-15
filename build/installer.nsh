; Extra steps for the Windows installer and uninstaller (electron-builder includes this through nsis.include).
;
; The story models are several gigabytes each. They are downloaded into the game's data folder, so the normal uninstall
; would leave them behind. When someone uninstalls the game they expect that space back, so remove them.
;
;   - Only on a real uninstall. When a newer installer updates the game it runs the old uninstaller first, with the
;     "updated" flag set (${isUpdated}); deleting then would make everyone download 7 GB again on every update.
;   - Only the models folder. Saved careers and settings live in the same data folder and are left alone.
;   - "hoops-legacy" is the app's name in package.json, which is what the game's data folder is called
;     (Electron: %APPDATA%\<name>). desktop/installer.test.ts checks the two stay in step.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\hoops-legacy\models"
  ${endIf}
!macroend
