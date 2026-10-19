import { useEffect, useRef, useState } from 'react';
import type { View } from '../app-types';
import type { InfoPage } from '../components/layout/SiteFooter';
import type { LibraryLocation } from '../features/library/library-location';

export type WorkspaceLocation = {
  view: View; documentId: string | null; infoPage: InfoPage | null;
  library: LibraryLocation; uploadFolderId: string | null; uploadMode: 'file' | 'photo';
};
type Entry = { owner: string; index: number; location: WorkspaceLocation };
const KEY = 'moonwordsNavigationV1';
const views = ['library','study','words','quiz','upload','profile'];
export function readWorkspaceHistory(state: unknown, owner: string): Entry | null {
  const entry = (state as Record<string, unknown> | null)?.[KEY] as Entry | undefined;
  if (!entry || entry.owner !== owner || !Number.isInteger(entry.index) || entry.index < 0) return null;
  const value = entry.location;
  if (!value || !views.includes(value.view) || !value.library || typeof value.library.folderId !== 'string'
    || !['all','readings','collections'].includes(value.library.kind)
    || !(value.documentId === null || typeof value.documentId === 'string')
    || !(value.infoPage === null || ['service','terms','privacy','contact'].includes(value.infoPage))
    || !(value.uploadFolderId === null || typeof value.uploadFolderId === 'string')
    || !['file','photo'].includes(value.uploadMode)) return null;
  return entry;
}

/** Store only screen identifiers, never auth credentials or learning content. */
export function useWorkspaceHistory({ location, owner, ready, restore }: {
  location: WorkspaceLocation; owner: string; ready: boolean;
  restore: (location: WorkspaceLocation, isCurrent: () => boolean) => Promise<void>;
}) {
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const initializedOwner = useRef('');
  const lastKey = useRef('');
  const pending = useRef(false);
  const generation = useRef(0);
  const replacing = useRef(false);
  const [index, setIndex] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const locationKey = JSON.stringify(location);

  useEffect(() => {
    if (!ready || !owner) return;
    const onPop = (event: PopStateEvent) => {
      const entry = readWorkspaceHistory(event.state, owner);
      if (!entry) return; // At the app root, external navigation still works.
      const ticket = ++generation.current;
      pending.current = true;
      setIndex(entry.index);
      void restoreRef.current(entry.location, () => generation.current === ticket).finally(() => {
        if (generation.current !== ticket) return;
        pending.current = false;
        replacing.current = true;
        setEpoch(value => value + 1);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); generation.current += 1; pending.current = false; };
  }, [owner, ready]);

  useEffect(() => {
    if (!ready || !owner || pending.current) return;
    const write = (nextIndex: number, replace: boolean) => {
      const state = { ...window.history.state, [KEY]: { owner, index: nextIndex, location: JSON.parse(locationKey) } };
      window.history[replace ? 'replaceState' : 'pushState'](state, '', window.location.href);
      setIndex(nextIndex); lastKey.current = locationKey;
    };
    if (initializedOwner.current !== owner) {
      initializedOwner.current = owner;
      replacing.current = false;
      write(0, true);
    } else if (replacing.current) {
      replacing.current = false;
      write(readWorkspaceHistory(window.history.state, owner)?.index ?? 0, true);
    } else if (lastKey.current !== locationKey) {
      write((readWorkspaceHistory(window.history.state, owner)?.index ?? 0) + 1, false);
    }
  }, [owner, ready, locationKey, epoch]);

  return { canGoBack: index > 0, goBack: () => { if (index > 0) window.history.back(); } };
}
