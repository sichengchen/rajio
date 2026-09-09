import { useEffect } from 'react';
import { desktopApi } from '@/desktop-api';
import { defaultShortcuts, shortcutActions } from '../../../shared/controls';
import { router } from '@/router';

export function KeyboardShortcuts() {
  useEffect(()=>{
    let bindings=defaultShortcuts;
    let active=true;
    void desktopApi.controls?.shortcuts().then(value=>{if(active) bindings=value.bindings;});
    const stop=desktopApi.controls?.onShortcuts(value=>{bindings=value;});
    const handle=(event:KeyboardEvent)=>{
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const el=event.target as HTMLElement;
      if (el.closest?.('input, textarea, select, button, [contenteditable="true"], [role="slider"], [role="combobox"]')) return;
      const command = /Mac/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
      if(command && event.code==='Comma' && !event.altKey && !event.shiftKey){event.preventDefault();void router.navigate({to:'/settings'});return;}
      if ((/Mac/.test(navigator.platform) ? event.ctrlKey : event.metaKey)) return;
      const key = event.code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'');
      const accelerator=[...(command?['CommandOrControl']:[]),...(event.altKey?['Alt']:[]),...(event.shiftKey?['Shift']:[]),key].join('+');
      for(const action of shortcutActions) if(!bindings[action].global && bindings[action].accelerator===accelerator){event.preventDefault();desktopApi.controls?.command({action});break;}
    };
    document.addEventListener('keydown',handle);
    return()=>{active=false;stop?.();document.removeEventListener('keydown',handle);};
  },[]);
  return null;
}
