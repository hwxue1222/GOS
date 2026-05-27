'use client';

import { useEffect, useRef, useState } from 'react';

export default function ScaleToFitClient(props: { baseWidth: number; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const outerW = outer.clientWidth;
      const nextScale = Math.min(1, outerW / props.baseWidth);
      const nextHeight = Math.ceil(inner.scrollHeight * nextScale);
      const nextOffsetX = Math.max(0, Math.floor((outerW - props.baseWidth * nextScale) / 2));
      setScale(nextScale);
      setHeight(nextHeight);
      setOffsetX(nextOffsetX);
    };

    const ro = new ResizeObserver(() => update());
    ro.observe(outer);
    ro.observe(inner);

    const onBeforePrint = () => {
      setScale(1);
      setHeight(null);
      setOffsetX(0);
    };
    const onAfterPrint = () => update();
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    update();

    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [props.baseWidth]);

  return (
    <div ref={outerRef} className="w-full">
      <div className="relative" style={height !== null ? { height } : undefined}>
        <div
          ref={innerRef}
          className="absolute top-0 print:static"
          style={{
            left: offsetX,
            width: props.baseWidth,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}

