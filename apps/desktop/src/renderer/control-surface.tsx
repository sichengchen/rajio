import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Play, Pause, Rewind, FastForward, SkipForward } from 'lucide-react';
import { emptyControlState, type ControlCommand } from '../shared/controls';
import { t, setLanguage } from '../shared/i18n';
import { CoverImage } from '@/components/ui/cover-image';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import './app/globals.css';
import './control-surface.css';
const api = window.newcastle!.controls!;
function Player() {
  const [state,setState] = useState(emptyControlState);
  const [seeking,setSeeking] = useState<number | null>(null);
  useEffect(()=>{
    let active=true;
    const update=(value:typeof state)=>{ if(active) { setLanguage(value.locale); document.documentElement.classList.toggle("dark",!!value.dark); setState(value); } };
    const stop=api.onState(update); void api.get().then(update);
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape') window.close();};
    window.addEventListener('keydown',escape);
    return()=>{active=false;stop();window.removeEventListener('keydown',escape);};
  },[]);
  const send=(action:ControlCommand['action'],value?:number)=>api.command({action,value});
  const time=(n:number)=>{const minutes=Math.floor(n/60);return new Intl.NumberFormat(state.locale,{useGrouping:false}).format(minutes)+':'+new Intl.NumberFormat(state.locale,{minimumIntegerDigits:2,useGrouping:false}).format(Math.floor(n%60));};
  return <main className="compact-player">
    <header className="compact-titlebar"><Button variant="ghost" size="icon" aria-label={t('Open Rajio')} title={t('Open Rajio')} onClick={()=>send('show')}><ArrowUpRight/></Button></header>
    <section className="compact-episode">
      <CoverImage src={state.artwork} alt="" size="lg"/>
      <div className="min-w-0 flex-1"><h1 title={state.title}>{state.title || t('No episode selected')}</h1><p title={state.show}>{state.show}</p>
      <nav aria-label={t('Playback')}>
        <Button variant="ghost" size="icon" aria-label={t('Skip Back')} disabled={!state.episodeId} onClick={()=>send('back')}><Rewind/></Button>
        <Button variant="secondary" size="icon" aria-label={t(state.playing?'Pause':'Play')} disabled={!state.episodeId} onClick={()=>send('toggle')}>{state.playing?<Pause fill="currentColor"/>:<Play fill="currentColor"/>}</Button>
        <Button variant="ghost" size="icon" aria-label={t('Skip Forward')} disabled={!state.episodeId} onClick={()=>send('forward')}><FastForward/></Button>
        <Button variant="ghost" size="icon" aria-label={t('Next Episode')} disabled={!state.episodeId} onClick={()=>send('next')}><SkipForward/></Button>
      </nav></div>
    </section>
    <div className="compact-progress"><Slider aria-label={t('Playback position')} min={0} max={state.duration||1} step={1} value={[seeking??state.position]} disabled={!state.episodeId||!state.duration} onValueChange={v=>setSeeking(v[0])} onValueCommit={v=>{send('seek',v[0]);setSeeking(null);}}/>
    <div className="compact-times"><span>{time(seeking??state.position)}</span><span>−{time(Math.max(0,state.duration-(seeking??state.position)))}</span></div></div>
    {state.error&&<p role="alert" className="text-xs text-destructive truncate">{state.error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Player/>);
