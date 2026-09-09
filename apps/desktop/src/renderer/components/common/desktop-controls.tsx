import { useEffect } from 'react';
import { desktopApi } from '@/desktop-api';
import { usePodcastStore } from '@/lib/store';
import { router } from '@/router';
import { getLocale, subscribeLocale } from '../../../shared/i18n';

export function DesktopControls() {
  useEffect(() => {
    const api = desktopApi.controls;
    if (!api) return;
    const publish = () => {
      const s = usePodcastStore.getState(); const p = s.playbackState;
      api.publish({ dark:document.documentElement.classList.contains("dark"), artwork:p.currentEpisode?.imageUrl || s.podcasts.find(show=>show.id===p.currentEpisode?.podcastId)?.imageUrl, episodeId:p.currentEpisode?.id ?? '', title:p.currentEpisode?.title ?? '', show:s.podcasts.find(show=>show.id === p.currentEpisode?.podcastId)?.title ?? '', playing:p.isPlaying, position:p.currentTime, duration:p.duration, locale:getLocale(), error:s.error });
    };
    // Progress updates are bounded; state changes (pause/selection) publish immediately.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = usePodcastStore.subscribe((s, previous) => {
      if (s.playbackState === previous.playbackState && s.podcasts === previous.podcasts && s.error === previous.error) return;
      if (s.playbackState.isPlaying !== previous.playbackState.isPlaying || s.playbackState.currentEpisode !== previous.playbackState.currentEpisode) { clearTimeout(timer); timer=undefined; publish(); }
      else if (!timer) timer=setTimeout(()=>{ timer=undefined; publish(); },250);
    });
    const commands = api.onCommand(cmd => {
      const s = usePodcastStore.getState(); const p=s.playbackState;
      if (cmd.action === 'settings') { void router.navigate({to:'/settings'}); return; }
      if (!p.currentEpisode) return;
      if (cmd.action === 'toggle') p.isPlaying ? s.pausePlayback() : s.resumePlayback();
      if (cmd.action === 'back') s.seekToTime(Math.max(0,p.currentTime-s.preferences.skipInterval));
      if (cmd.action === 'forward') s.seekToTime(Math.min(p.duration,p.currentTime+s.preferences.skipInterval));
      if (cmd.action === 'next') s.playNextEpisode();
      if (cmd.action === 'seek') s.seekToTime(cmd.value!);
    });
    const locale = subscribeLocale(publish);
    const appearance = new MutationObserver(publish); appearance.observe(document.documentElement,{attributes:true,attributeFilter:["class"]}); publish();
    return () => { unsubscribe(); commands(); locale(); appearance.disconnect(); clearTimeout(timer); };
  },[]);
  return null;
}
