import { useCallback, useEffect, useRef, useState } from 'react';

const CHANNEL_NAME = 'aksharajanani-projects';

interface TabLockOptions {
    /** Called before this tab hands the project to another tab (save pending work). */
    beforeRelease: () => Promise<unknown>;
    /** Called when this tab becomes the one that saves (reload the latest stored version). */
    afterTakeOver: () => Promise<unknown>;
}

/**
 * One tab per project saves (P3). Each tab used to autosave its own copy over the stored
 * project, so with two tabs open the last one to save silently threw away the other's work.
 *
 * The tab holding the project's Web Lock saves. Another tab opening the same project doesn't get
 * the lock: it shows a warning, doesn't save, and waits. "Use this tab instead" asks the owner
 * (via BroadcastChannel) to save and let go; when the lock comes free (handed over, or the other
 * tab closed) this tab reloads the stored project first, so it doesn't overwrite newer work with
 * its older copy, and then saves from then on.
 *
 * Browsers without Web Locks or BroadcastChannel behave as before (every tab saves).
 */
export const useProjectTabLock = (projectId: number | undefined, options: TabLockOptions) => {
    const [isOwner, setIsOwner] = useState(true);
    const releaseRef = useRef<(() => void) | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const supported = typeof navigator !== 'undefined' && !!navigator.locks && typeof BroadcastChannel !== 'undefined';
    const lockName = projectId !== undefined ? `aksharajanani-project-${projectId}` : null;

    useEffect(() => {
        if (!supported || !lockName) {
            setIsOwner(true);
            return;
        }
        let active = true;
        const abort = new AbortController();

        // Holds the lock until `releaseRef.current()` is called.
        const holdLock = () => new Promise<void>(release => { releaseRef.current = release; });

        navigator.locks.request(lockName, { ifAvailable: true }, lock => {
            if (!active) return;
            if (lock) {
                setIsOwner(true);
                return holdLock();
            }
            // Someone else has it: don't save, and wait for it to come free.
            setIsOwner(false);
            navigator.locks.request(lockName, { signal: abort.signal }, async () => {
                if (!active) return;
                await optionsRef.current.afterTakeOver().catch(err => console.error('Reloading after take-over failed:', err));
                if (!active) return;
                setIsOwner(true);
                return holdLock();
            }).catch(() => { /* aborted on unmount */ });
            return undefined;
        });

        const channel = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = channel;
        channel.onmessage = async (event) => {
            if (event.data?.type !== 'take-over' || event.data.lockName !== lockName || !releaseRef.current) return;
            await optionsRef.current.beforeRelease().catch(err => console.error('Saving before hand-over failed:', err));
            const release = releaseRef.current;
            releaseRef.current = null;
            setIsOwner(false);
            release?.();
            // Wait for it back, as a second tab would.
            navigator.locks.request(lockName, { signal: abort.signal }, async () => {
                if (!active) return;
                await optionsRef.current.afterTakeOver().catch(err => console.error('Reloading after take-over failed:', err));
                if (!active) return;
                setIsOwner(true);
                return holdLock();
            }).catch(() => { /* aborted on unmount */ });
        };

        return () => {
            active = false;
            abort.abort();
            channel.close();
            channelRef.current = null;
            releaseRef.current?.();
            releaseRef.current = null;
        };
    }, [lockName, supported]);

    /** Ask the tab that has the project to hand it over to this one. */
    const takeOver = useCallback(() => {
        if (lockName) channelRef.current?.postMessage({ type: 'take-over', lockName });
    }, [lockName]);

    return { isOwner, takeOver };
};
