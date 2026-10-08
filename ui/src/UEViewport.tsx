import * as React from 'react';
import { useEffect, useRef } from 'react';
import { bridgeCall } from './bridge';

export interface CameraSpec {
    /** world-space camera location [x,y,z] */
    location?: [number, number, number];
    /** pitch, yaw, roll in degrees */
    rotation?: [number, number, number];
    fov?: number;
}

export interface UEViewportProps {
    /** unique id — the UE side keys the capture/image to this */
    id: string;
    /** camera config; omit for the default (framed on the player pawn) */
    camera?: CameraSpec;
    /** keep capturing every frame (default true); false renders once */
    live?: boolean;
    /** extra content rendered INSIDE the hole region, on top of the 3D view */
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * A "hole" in the web UI. The element itself is transparent; the UE side places
 * a live SceneCapture image under the page at this element's screen rect.
 * Children render in the DOM *over* the 3D view (labels, borders, buttons).
 */
export function UEViewport(props: UEViewportProps) {
    const ref = useRef<HTMLDivElement>(null);
    const registered = useRef(false);
    const lastRect = useRef('');

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const rectOf = () => {
            const r = el.getBoundingClientRect();
            return {
                x: r.left / window.innerWidth,
                y: r.top / window.innerHeight,
                w: r.width / window.innerWidth,
                h: r.height / window.innerHeight,
            };
        };

        const push = (force = false) => {
            const rect = rectOf();
            const key = JSON.stringify(rect);
            if (!force && key === lastRect.current) return;
            lastRect.current = key;
            if (!registered.current) {
                if (bridgeCall('RegisterViewport', { id: props.id, rect, camera: props.camera, live: props.live ?? true })) {
                    registered.current = true;
                }
            } else {
                bridgeCall('MoveViewport', { id: props.id, rect });
            }
        };

        // the bridge binds asynchronously — retry until RegisterViewport lands
        let attempts = 0;
        const registerTimer = window.setInterval(() => {
            if (registered.current || ++attempts > 120) {
                window.clearInterval(registerTimer);
            }
            if (!registered.current) push(true);
        }, 250);

        const ro = new ResizeObserver(() => push());
        ro.observe(el);

        // also track layout drift (animations, window resize, reflow)
        let raf = 0;
        const loop = () => { push(); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);

        return () => {
            window.clearInterval(registerTimer);
            cancelAnimationFrame(raf);
            ro.disconnect();
            bridgeCall('UnregisterViewport', { id: props.id });
            registered.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.id]);

    return (
        <div
            ref={ref}
            className={props.className}
            style={{ background: 'transparent', ...props.style }}
            data-viewport-id={props.id}
        >
            {props.children}
        </div>
    );
}
