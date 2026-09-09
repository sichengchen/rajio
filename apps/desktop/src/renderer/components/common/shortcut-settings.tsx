import { useEffect, useState } from 'react';
import { desktopApi } from '@/desktop-api';
import { defaultShortcuts, shortcutActions, shortcutLabels, type ShortcutAction, type ShortcutBindings } from '../../../shared/controls';
import { t } from '../../../shared/i18n';
import { Button } from '@/components/ui/button';
import { SettingsGroup, SettingsItem } from '@/components/ui-custom/settings';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';

function keyLabels(value:string) {
  const mac=/Mac/.test(navigator.platform);
  return value.split('+').map(key=>({CommandOrControl:mac?'⌘':'Ctrl',Shift:'⇧',Alt:mac?'⌥':'Alt',Left:'←',Right:'→',Up:'↑',Down:'↓',Space:'Space'})[key]??key);
}
export function ShortcutSettings() {
  const [bindings,setBindings]=useState(defaultShortcuts);
  const [recording,setRecording]=useState<ShortcutAction|null>(null);
  const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(()=>{void desktopApi.controls?.shortcuts().then(value=>{setBindings(value.bindings);setError(value.error??'');});},[]);
  const save=async(next:ShortcutBindings)=>{setSaving(true);setError('');try{await desktopApi.controls?.saveShortcuts(next);setBindings(next);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);setRecording(null);}};
  return <SettingsGroup title={t('Keyboard Shortcuts')}>
    {shortcutActions.map(action=><SettingsItem key={action} label={t(shortcutLabels[action])} controlId={'shortcut-'+action}>
      <div className="flex items-center gap-3">
        <Button id={'shortcut-'+action} variant="outline" size="sm" className="justify-start gap-1 px-3 font-normal" disabled={saving} aria-label={t(shortcutLabels[action])} onClick={()=>setRecording(action)} onBlur={()=>setRecording(null)} onKeyDown={e=>{
          if(recording!==action||e.key==='Tab')return; e.preventDefault();e.stopPropagation();
          if(e.key==='Escape'){setRecording(null);return;}
          if(['Meta','Control','Alt','Shift'].includes(e.key))return;
          const accelerator=e.key==='Backspace'?'':[...(e.metaKey||e.ctrlKey?['CommandOrControl']:[]),...(e.altKey?['Alt']:[]),...(e.shiftKey?['Shift']:[]),e.code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'')].join('+');
          void save({...bindings,[action]:{...bindings[action],accelerator}});
        }}>{recording===action?<span className="text-muted-foreground">{t('Press keys…')}</span>:bindings[action].accelerator?keyLabels(bindings[action].accelerator).map((key,index)=><kbd key={index} className="min-w-5 text-center font-sans text-sm">{key}</kbd>):<span className="text-muted-foreground">{t('None')}</span>}</Button>
        <Select value={bindings[action].global?'global':'app'} disabled={saving} onValueChange={value=>void save({...bindings,[action]:{...bindings[action],global:value==='global'}})}>
          <SelectTrigger className="h-8 w-auto text-sm" aria-label={t(shortcutLabels[action])+' — '+t('Scope')}><SelectValue/></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="app">{t('In Rajio')}</SelectItem><SelectItem value="global">{t('Global')}</SelectItem></SelectGroup></SelectContent>
        </Select>
      </div>
    </SettingsItem>)}
    <div className="flex items-center justify-end gap-4 pt-3"><Button size="sm" variant="outline" className="justify-start px-3" disabled={saving} onClick={()=>void save(defaultShortcuts)}>{t('Reset to defaults')}</Button></div>
    {error&&<p className="py-2 text-sm text-destructive" role="alert">{error}</p>}
  </SettingsGroup>;
}
